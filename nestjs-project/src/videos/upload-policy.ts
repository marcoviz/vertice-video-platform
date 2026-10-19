import { MAX_VIDEO_BYTES, PART_BYTES } from './video.constants';
import { VideoException } from './video.exception';

export interface UploadedPart {
  partNumber: number;
  etag: string;
}
export interface StoredPart extends UploadedPart {
  size: number;
}
export function partCount(size: number): number {
  return Math.ceil(size / PART_BYTES);
}
export function partLength(size: number, number: number): number {
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_VIDEO_BYTES ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > partCount(size)
  ) {
    throw new VideoException(
      'INVALID_UPLOAD',
      422,
      'Invalid file size or part number',
    );
  }
  return Math.min(PART_BYTES, size - (number - 1) * PART_BYTES);
}
export function verifyParts(
  size: number,
  submitted: UploadedPart[],
  stored: StoredPart[],
): void {
  const expected = partCount(size);
  if (submitted.length !== expected || stored.length !== expected) {
    throw new VideoException('UPLOAD_MISMATCH', 422, 'Upload is incomplete');
  }
  const sorted = [...submitted].sort((a, b) => a.partNumber - b.partNumber);
  const actual = new Map(stored.map((p) => [p.partNumber, p]));
  for (let index = 0; index < expected; index++) {
    const supplied = sorted[index];
    const part = actual.get(index + 1);
    if (
      supplied.partNumber !== index + 1 ||
      !part ||
      part.etag !== supplied.etag ||
      part.size !== partLength(size, index + 1)
    ) {
      throw new VideoException(
        'UPLOAD_MISMATCH',
        422,
        'Part size, order or ETag does not match',
      );
    }
  }
}
