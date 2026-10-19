import { Test } from '@nestjs/testing';
import { VideoProcessorService } from './video-processor.service';
import { VideosRepository } from '../videos.repository';
import { StorageService } from '../storage.service';
import { FfmpegService } from './ffmpeg.service';
// Filesystem operations are collaborators in this unit suite, not real I/O.
jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn().mockResolvedValue('/temporary'),
  rm: jest.fn().mockResolvedValue(undefined),
}));
import { mkdtemp, rm } from 'node:fs/promises';
describe('VideoProcessorService retry policy', () => {
  let processor: VideoProcessorService;
  const repo = { find: jest.fn(), updateProcessing: jest.fn() };
  const storage = { download: jest.fn(), putFile: jest.fn() };
  const ffmpeg = { probe: jest.fn(), render: jest.fn() };
  beforeEach(async () => {
    jest.clearAllMocks();
    repo.find.mockResolvedValue({
      id: 'v',
      channel_id: 'c',
      status: 'processing',
      source_key: 'source',
    });
    storage.download.mockResolvedValue(undefined);
    ffmpeg.probe.mockResolvedValue({
      duration: 2,
      width: 320,
      height: 240,
      codec: 'h264',
    });
    const module = await Test.createTestingModule({
      providers: [
        VideoProcessorService,
        { provide: VideosRepository, useValue: repo },
        { provide: StorageService, useValue: storage },
        { provide: FfmpegService, useValue: ffmpeg },
      ],
    }).compile();
    processor = module.get(VideoProcessorService);
  });
  it('publishes ready only after both objects are stored', async () => {
    await processor.process('v');
    expect(storage.putFile).toHaveBeenCalledTimes(2);
    expect(repo.updateProcessing).toHaveBeenCalledWith(
      'v',
      expect.objectContaining({ status: 'ready', duration_seconds: 2 }),
    );
    expect(rm).toHaveBeenCalledWith('/temporary', {
      recursive: true,
      force: true,
    });
  });
  it('does no work for already ready jobs', async () => {
    repo.find.mockResolvedValue({ status: 'ready' });
    await processor.process('v');
    expect(storage.download).not.toHaveBeenCalled();
  });
  it('keeps processing on transient failures and propagates the failure', async () => {
    storage.download.mockRejectedValue(new Error('network'));
    await expect(processor.process('v')).rejects.toThrow('network');
    expect(repo.updateProcessing).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalled();
  });
  it('rejects a terminal failed video without publishing media', async () => {
    repo.find.mockResolvedValue({ status: 'failed' });
    await expect(processor.process('v')).rejects.toThrow('not pending');
    expect(storage.download).not.toHaveBeenCalled();
    expect(repo.updateProcessing).not.toHaveBeenCalled();
  });
  it('propagates disk failure for the queue to determine the terminal state', async () => {
    jest.mocked(mkdtemp).mockRejectedValueOnce(new Error('disk full'));
    await expect(processor.process('v')).rejects.toThrow('disk full');
    expect(repo.updateProcessing).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });
});
