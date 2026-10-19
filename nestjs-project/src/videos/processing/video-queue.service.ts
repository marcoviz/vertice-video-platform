import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  VIDEO_ATTEMPTS,
  VIDEO_QUEUE,
  VIDEO_RECONCILE_BATCH,
  VIDEO_RECONCILE_INTERVAL_MS,
} from '../video.constants';
import { VideosRepository } from '../videos.repository';
import { VIDEO_QUEUE_NAME, videoQueueConnection } from './video-queue.config';

@Injectable()
export class VideoQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoQueueService.name);
  private queue: Queue<{ videoId: string }>;
  private timer: NodeJS.Timeout | undefined;
  private dispatching: Promise<void> | undefined;
  private cursor: string | undefined;
  private closed = false;
  constructor(
    private readonly repo: VideosRepository,
    @Optional()
    @Inject(VIDEO_QUEUE_NAME)
    private readonly queueName: string = VIDEO_QUEUE,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(this.queueName, {
      connection: videoQueueConnection(),
    });
    this.queue.on('error', (error) => this.logger.error(error.message));
    this.timer = setInterval(() => {
      void this.reconcileInBackground();
    }, VIDEO_RECONCILE_INTERVAL_MS);
    // A temporary DB failure at startup must not disable later reconciliation.
    await this.reconcileInBackground();
  }

  async reconcileInBackground(): Promise<void> {
    try {
      await this.dispatch();
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : 'Video reconciliation failed',
      );
    }
  }

  async dispatch(): Promise<void> {
    if (this.closed) return;
    if (this.dispatching) return this.dispatching;
    this.dispatching = this.reconcileBatch();
    try {
      await this.dispatching;
    } finally {
      this.dispatching = undefined;
    }
  }

  private async reconcileBatch(): Promise<void> {
    const videos = await this.repo.processingBatch(this.cursor);
    for (const video of videos) {
      if (this.closed) break;
      try {
        const jobId = `video-${video.id}`;
        const state = await this.queue.getJobState(jobId);
        if (state === 'failed' || state === 'completed') {
          // A late failure must never overwrite a result already published.
          // completed + processing is inconsistent: do not publish missing media.
          await this.repo.updateProcessing(video.id, {
            status: 'failed',
            error_code: 'PROCESSING_FAILED',
          });
        } else if (state === 'unknown') {
          // Stable IDs make concurrent reconcilers safe. Republish even when
          // queued_at is set, so missing Redis jobs are recoverable after restart.
          await this.queue.add(
            'process',
            { videoId: video.id },
            {
              jobId,
              attempts: VIDEO_ATTEMPTS,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: false,
              removeOnFail: false,
            },
          );
          await this.repo.updateProcessing(video.id, { queued_at: new Date() });
        } else if (!video.queued_at) {
          await this.repo.updateProcessing(video.id, { queued_at: new Date() });
        }
      } catch (error) {
        // This background item is revisited on a later cursor cycle; a failed
        // write or connection cannot permanently lose a terminal transition.
        this.logger.error(
          `Video ${video.id} reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    this.cursor =
      videos.length === VIDEO_RECONCILE_BATCH ? videos.at(-1)?.id : undefined;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    try {
      await this.dispatching;
    } finally {
      await this.queue?.close();
    }
  }
}
