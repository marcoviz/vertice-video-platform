import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { VIDEO_QUEUE } from '../video.constants';
import { VideoProcessorService } from './video-processor.service';
import { VideoQueueService } from './video-queue.service';
import { VIDEO_QUEUE_NAME, videoQueueConnection } from './video-queue.config';

@Injectable()
export class VideoQueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoQueueWorkerService.name);
  private worker: Worker<{ videoId: string }>;
  constructor(
    private readonly processor: VideoProcessorService,
    private readonly queue: VideoQueueService,
    @Optional()
    @Inject(VIDEO_QUEUE_NAME)
    private readonly queueName: string = VIDEO_QUEUE,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<{ videoId: string }>(
      this.queueName,
      async (job) => this.processor.process(job.data.videoId),
      { connection: videoQueueConnection(), concurrency: 1 },
    );
    this.worker.on('error', (error) => this.logger.error(error.message));
    this.worker.on('failed', (job) => {
      this.logger.warn(`Video job ${job?.id ?? 'unknown'} failed`);
      // Hints reduce latency. Startup/polling also recover lost events and
      // failed handlers, including failures that never invoked the processor.
      void this.queue.reconcileInBackground();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
