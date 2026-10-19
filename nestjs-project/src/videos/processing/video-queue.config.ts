import type { ConnectionOptions } from 'bullmq';

// Optional injection isolates real queues in integration tests.
export const VIDEO_QUEUE_NAME = Symbol('VIDEO_QUEUE_NAME');

export function videoQueueConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'queue',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  };
}
