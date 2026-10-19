import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { VIDEO_ATTEMPTS, VIDEO_QUEUE } from '../video.constants';
import { VideosRepository } from '../videos.repository';
import { VideoProcessorService } from './video-processor.service';

@Injectable()
export class VideoQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoQueueService.name);
  private readonly connection = {
    host: process.env.REDIS_HOST ?? 'queue',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  };
  private queue: Queue<{ videoId: string }>;
  private worker: Worker<{ videoId: string }>;
  private timer: NodeJS.Timeout | undefined;
  private dispatching = false;
  private closed = false;
  constructor(
    private readonly repo: VideosRepository,
    private readonly processor: VideoProcessorService,
  ) {}
  async onModuleInit(): Promise<void> {
    this.queue = new Queue(VIDEO_QUEUE, { connection: this.connection });
    this.worker = new Worker<{ videoId: string }>(
      VIDEO_QUEUE,
      async (job) => {
        await this.processor.process(
          job.data.videoId,
          job.attemptsMade + 1 >= (job.opts.attempts ?? VIDEO_ATTEMPTS),
        );
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.worker.on('error', (error) => this.logger.error(error.message));
    this.worker.on('failed', (job) =>
      this.logger.warn(
        `Video job ${job?.id ?? 'unknown'} failed; retry policy applies`,
      ),
    );
    this.queue.on('error', (error) => this.logger.error(error.message));
    await this.dispatch();
    this.timer = setInterval(() => {
      void this.dispatch().catch((error) =>
        this.logger.error(
          error instanceof Error ? error.message : 'Dispatch failed',
        ),
      );
    }, 2000);
  }
  async dispatch(): Promise<void> {
    if (this.dispatching || this.closed) return;
    this.dispatching = true;
    try {
      for (const video of await this.repo.pending()) {
        await this.queue.add(
          'process',
          { videoId: video.id },
          {
            jobId: `video-${video.id}`,
            attempts: VIDEO_ATTEMPTS,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await this.repo.update(video.id, { queued_at: new Date() });
      }
    } finally {
      this.dispatching = false;
    }
  }
  async onModuleDestroy(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
