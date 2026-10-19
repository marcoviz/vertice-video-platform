import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Video } from './entities/video.entity';
import { createTestDataSource } from '../test/create-test-data-source';
import { VideosRepository } from './videos.repository';
import { VIDEO_RECONCILE_BATCH } from './video.constants';
describe('VideosRepository (real Postgres)', () => {
  let db: DataSource;
  let repo: VideosRepository;
  let module: TestingModule;
  let user: User;
  let channel: Channel;
  beforeAll(async () => {
    db = createTestDataSource([User, Channel, Video]);
    await db.initialize();
    module = await Test.createTestingModule({
      providers: [
        VideosRepository,
        { provide: DataSource, useValue: db },
        {
          provide: getRepositoryToken(Video),
          useValue: db.getRepository(Video),
        },
      ],
    }).compile();
    repo = module.get(VideosRepository);
    user = await db.getRepository(User).save({
      email: `${randomUUID()}@example.test`,
      password: 'test-only',
      is_confirmed: true,
    });
    channel = await db
      .getRepository(Channel)
      .save({ user_id: user.id, name: 'Video tests', nickname: randomUUID() });
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.getRepository(Channel).delete(channel.id);
      await db.getRepository(User).delete(user.id);
      await db.destroy();
    }
    if (module) await module.close();
  });
  beforeEach(async () => {
    await db.getRepository(Video).delete({ channel_id: channel.id });
  });
  it('enforces unique URL, ownership and the processing outbox', async () => {
    const video = await repo.create({
      slug: randomUUID(),
      channel_id: channel.id,
      title: 'Sample',
      filename: 'sample.mp4',
      content_type: 'video/mp4',
      byte_size: '12',
      source_key: randomUUID(),
      status: 'draft',
    });
    await expect(repo.owned(video.id, randomUUID())).rejects.toThrow(
      'not found',
    );
    expect((await repo.owned(video.id, user.id)).id).toBe(video.id);
    await expect(
      repo.create({
        slug: video.slug,
        channel_id: channel.id,
        title: 'Duplicate',
        filename: 'x',
        content_type: 'video/mp4',
        byte_size: '12',
        source_key: randomUUID(),
      }),
    ).rejects.toThrow();
    await repo.lockOwned(video.id, user.id, async (row, manager) => {
      row.status = 'processing';
      await manager.save(row);
    });
    expect(
      (await repo.processingBatch()).some((row) => row.id === video.id),
    ).toBe(true);
    await repo.update(video.id, { queued_at: new Date() });
    expect(
      (await repo.processingBatch()).some((row) => row.id === video.id),
    ).toBe(true);
    await expect(repo.publicVideo(video.slug)).rejects.toThrow('not found');
  });
  it('does not let stale reconciliation overwrite ready or failed results', async () => {
    const video = await repo.create({
      slug: randomUUID(),
      channel_id: channel.id,
      title: 'Race',
      filename: 'race.mp4',
      content_type: 'video/mp4',
      byte_size: '12',
      source_key: randomUUID(),
      status: 'processing',
    });
    await repo.updateProcessing(video.id, { status: 'ready' });
    await repo.updateProcessing(video.id, {
      status: 'failed',
      error_code: 'PROCESSING_FAILED',
    });
    expect((await repo.find(video.id))?.status).toBe('ready');
    await repo.update(video.id, { status: 'failed' });
    await repo.updateProcessing(video.id, { status: 'ready' });
    expect((await repo.find(video.id))?.status).toBe('failed');
  });
  it('visits processing rows beyond the first batch even when already queued', async () => {
    const ids: string[] = [];
    for (let index = 0; index <= VIDEO_RECONCILE_BATCH; index++) {
      const video = await repo.create({
        slug: randomUUID(),
        channel_id: channel.id,
        title: 'Cursor',
        filename: 'cursor.mp4',
        content_type: 'video/mp4',
        byte_size: '12',
        source_key: randomUUID(),
        status: 'processing',
        queued_at: new Date(),
      });
      ids.push(video.id);
    }
    ids.sort();
    const first = await repo.processingBatch();
    const second = await repo.processingBatch(first.at(-1)!.id);
    expect(first.map((video) => video.id)).toEqual(
      ids.slice(0, VIDEO_RECONCILE_BATCH),
    );
    expect(second.map((video) => video.id)).toEqual(
      ids.slice(VIDEO_RECONCILE_BATCH),
    );
  });
});
