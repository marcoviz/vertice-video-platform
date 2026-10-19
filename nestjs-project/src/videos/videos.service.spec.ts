import { Test } from '@nestjs/testing';
import { VideosService } from './videos.service';
import { VideosRepository } from './videos.repository';
import { StorageService } from './storage.service';
import { Video } from './entities/video.entity';

describe('VideosService ownership and completion', () => {
  let service: VideosService;
  let video: Video;
  const save = jest.fn();
  const repo = {
    channelId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    owned: jest.fn(),
    publicVideo: jest.fn(),
    lockOwned: jest.fn(),
  };
  const storage = {
    initiate: jest.fn(),
    signPart: jest.fn(),
    head: jest.fn(),
    parts: jest.fn(),
    complete: jest.fn(),
    abort: jest.fn(),
    remove: jest.fn(),
    url: jest.fn(),
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    video = Object.assign(new Video(), {
      id: 'v',
      slug: 's',
      channel_id: 'c',
      status: 'draft',
      source_key: 'secret/source',
      upload_id: 'upload',
      byte_size: '12',
      filename: 'recording.mp4',
    });
    repo.lockOwned.mockImplementation(
      (
        _id: string,
        _user: string,
        action: (
          video: Video,
          manager: { save: typeof save; remove: jest.Mock },
        ) => Promise<unknown>,
      ) => action(video, { save, remove: jest.fn() }),
    );
    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: VideosRepository, useValue: repo },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = module.get(VideosService);
  });
  it('creates a draft before any storage request', async () => {
    repo.channelId.mockResolvedValue('channel');
    repo.create.mockImplementation((data: Partial<Video>) => data);
    const result = await service.start('user', {
      title: 'A',
      filename: 'f.mp4',
      contentType: 'video/mp4',
      byteSize: 12,
    });
    expect(result.status).toBe('draft');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: 'channel', status: 'draft' }),
    );
    expect(storage.initiate).not.toHaveBeenCalled();
  });
  it('does not issue URLs to another user', async () => {
    repo.lockOwned.mockRejectedValue(new Error('Video not found'));
    await expect(service.sign('other', 'v', [1])).rejects.toThrow('not found');
    expect(storage.signPart).not.toHaveBeenCalled();
  });
  it('signs the exact declared part length', async () => {
    storage.signPart.mockResolvedValue('url');
    await expect(service.sign('owner', 'v', [1])).resolves.toEqual([
      { partNumber: 1, url: 'url' },
    ]);
    expect(storage.signPart).toHaveBeenCalledWith(
      'secret/source',
      'upload',
      1,
      12,
    );
  });
  it('rejects signing when processing has started', async () => {
    video.status = 'processing';
    await expect(service.sign('owner', 'v', [1])).rejects.toThrow('draft');
  });
  it('validates storage parts before transitioning to processing', async () => {
    storage.head.mockResolvedValueOnce(null).mockResolvedValueOnce(12);
    storage.parts.mockResolvedValue([
      { partNumber: 1, etag: 'real', size: 12 },
    ]);
    await expect(
      service.complete('owner', 'v', {
        parts: [{ partNumber: 1, etag: 'real' }],
      }),
    ).resolves.toEqual({ id: 'v', status: 'processing' });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ upload_id: null, queued_at: null }),
    );
  });
  it('does not complete a forged multipart upload', async () => {
    storage.head.mockResolvedValue(null);
    storage.parts.mockResolvedValue([
      { partNumber: 1, etag: 'real', size: 12 },
    ]);
    await expect(
      service.complete('owner', 'v', {
        parts: [{ partNumber: 1, etag: 'fake' }],
      }),
    ).rejects.toThrow('ETag');
    expect(storage.complete).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it('recovers after S3 completion and before database commit', async () => {
    storage.head.mockResolvedValue(12);
    await service.complete('owner', 'v', {
      parts: [{ partNumber: 1, etag: 'unused' }],
    });
    expect(storage.complete).not.toHaveBeenCalled();
    expect(video.status).toBe('processing');
  });
  it('completion is idempotent after ready', async () => {
    video.status = 'ready';
    await expect(
      service.complete('owner', 'v', { parts: [] }),
    ).resolves.toEqual({ id: 'v', status: 'ready' });
    expect(storage.head).not.toHaveBeenCalled();
  });
  it('does not expose keys or upload IDs in public metadata', async () => {
    repo.publicVideo.mockResolvedValue(video);
    const result = await service.metadata('s');
    expect(result).not.toHaveProperty('source_key');
    expect(result).not.toHaveProperty('upload_id');
  });
  it('uses attachment only for original download', async () => {
    repo.publicVideo.mockResolvedValue({
      ...video,
      status: 'ready',
      playback_key: 'playback',
    });
    await service.media('s', 'download');
    expect(storage.url).toHaveBeenCalledWith('secret/source', 'recording.mp4');
    await service.media('s', 'stream');
    expect(storage.url).toHaveBeenLastCalledWith('playback', undefined);
  });
});
