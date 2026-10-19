import { MAX_VIDEO_BYTES, PART_BYTES } from './video.constants';
import { partCount, partLength, verifyParts } from './upload-policy';
describe('direct multipart policy', () => {
  it('supports exactly 10GB without allocating a file', () => {
    expect(partCount(MAX_VIDEO_BYTES)).toBe(150);
    expect(partLength(MAX_VIDEO_BYTES, 150)).toBe(
      MAX_VIDEO_BYTES - 149 * PART_BYTES,
    );
  });
  it.each([0, -1, MAX_VIDEO_BYTES + 1, 1.5, NaN, Infinity])(
    'rejects invalid declared size %s',
    (size) => expect(() => partLength(size, 1)).toThrow('Invalid'),
  );
  it.each([0, -1, 2, 1.1])(
    'rejects invalid part %s for a one-part file',
    (part) => expect(() => partLength(10, part)).toThrow('Invalid'),
  );
  it('accepts exact parts even when submitted out of order', () => {
    expect(() =>
      verifyParts(
        PART_BYTES + 3,
        [
          { partNumber: 2, etag: 'b' },
          { partNumber: 1, etag: 'a' },
        ],
        [
          { partNumber: 1, etag: 'a', size: PART_BYTES },
          { partNumber: 2, etag: 'b', size: 3 },
        ],
      ),
    ).not.toThrow();
  });
  it('rejects forged ETag', () =>
    expect(() =>
      verifyParts(
        10,
        [{ partNumber: 1, etag: 'bad' }],
        [{ partNumber: 1, etag: 'real', size: 10 }],
      ),
    ).toThrow());
  it('rejects oversized actual data', () =>
    expect(() =>
      verifyParts(
        10,
        [{ partNumber: 1, etag: 'real' }],
        [{ partNumber: 1, etag: 'real', size: 11 }],
      ),
    ).toThrow());
  it('rejects missing and duplicate parts', () => {
    expect(() => verifyParts(PART_BYTES + 10, [], [])).toThrow();
    expect(() =>
      verifyParts(
        PART_BYTES + 10,
        [
          { partNumber: 1, etag: 'a' },
          { partNumber: 1, etag: 'a' },
        ],
        [
          { partNumber: 1, etag: 'a', size: PART_BYTES },
          { partNumber: 2, etag: 'b', size: 10 },
        ],
      ),
    ).toThrow();
  });
});
