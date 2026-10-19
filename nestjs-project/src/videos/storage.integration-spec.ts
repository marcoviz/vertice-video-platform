import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { verifyParts } from './upload-policy';
describe('StorageService (real MinIO integration)', () => {
  let storage: StorageService;
  let module: TestingModule;
  const key = `tests/${randomUUID()}`;
  let uploadId: string;
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();
    storage = module.get(StorageService);
  });
  afterAll(async () => {
    if (uploadId) await storage.abort(key, uploadId);
    await storage.remove(key);
    await module.close();
  });
  it('uploads, validates, completes, ranges and deletes a real object', async () => {
    uploadId = await storage.initiate(key, 'video/mp4');
    const response = await fetch(await storage.signPart(key, uploadId, 1, 12), {
      method: 'PUT',
      body: Buffer.from('twelve bytes'),
      headers: { 'content-length': '12' },
    });
    expect(response.ok).toBe(true);
    const etag = response.headers.get('etag')!;
    const parts = [{ partNumber: 1, etag }];
    verifyParts(12, parts, await storage.parts(key, uploadId));
    await storage.complete(key, uploadId, parts);
    expect(await storage.head(key)).toBe(12);
    const range = await fetch(await storage.url(key), {
      headers: { range: 'bytes=0-3' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 0-3/12');
    expect(await range.text()).toBe('twel');
    uploadId = '';
  });
});
