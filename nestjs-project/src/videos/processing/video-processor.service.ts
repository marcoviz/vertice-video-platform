import { Injectable } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VideosRepository } from '../videos.repository';
import { StorageService } from '../storage.service';
import { FfmpegService } from './ffmpeg.service';

@Injectable()
export class VideoProcessorService {
  constructor(
    private readonly repo: VideosRepository,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}
  async process(videoId: string, lastAttempt: boolean): Promise<void> {
    const video = await this.repo.find(videoId);
    if (!video) throw new Error('Video does not exist');
    if (video.status === 'ready') return;
    if (video.status !== 'processing')
      throw new Error('Video is not pending processing');
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'vertice-'));
      const input = join(directory, 'source');
      const output = join(directory, 'video.mp4');
      const thumbnail = join(directory, 'thumbnail.jpg');
      await this.storage.download(video.source_key, input);
      const probe = await this.ffmpeg.probe(input);
      await this.ffmpeg.render(input, output, thumbnail);
      const playbackKey = `channels/${video.channel_id}/${video.id}/playback.mp4`;
      const thumbnailKey = `channels/${video.channel_id}/${video.id}/thumbnail.jpg`;
      await this.storage.putFile(playbackKey, output, 'video/mp4');
      await this.storage.putFile(thumbnailKey, thumbnail, 'image/jpeg');
      await this.repo.update(video.id, {
        status: 'ready',
        playback_key: playbackKey,
        thumbnail_key: thumbnailKey,
        duration_seconds: probe.duration,
        metadata: {
          width: probe.width,
          height: probe.height,
          codec: probe.codec,
        },
        error_code: null,
      });
    } catch (error) {
      if (lastAttempt)
        await this.repo.update(video.id, {
          status: 'failed',
          error_code: 'PROCESSING_FAILED',
        });
      throw error;
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
