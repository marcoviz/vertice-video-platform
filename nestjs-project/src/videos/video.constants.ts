export const MAX_VIDEO_BYTES = 10_000_000_000;
export const PART_BYTES = 64 * 1024 * 1024;
export const VIDEO_QUEUE = 'video-processing';
export const VIDEO_ATTEMPTS = 3;
export const VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
] as const;
export type VideoStatus = 'draft' | 'processing' | 'ready' | 'failed';
