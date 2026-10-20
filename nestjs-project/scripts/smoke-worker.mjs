// Runs in a one-off API image while the API and video-worker are separate containers.
// The only direct DB writes are disposable test fixtures and their cleanup.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bullmq';
import storageModule from '../dist/videos/storage.service.js';
import queueConfig from '../dist/videos/processing/video-queue.config.js';

const db = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'db',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'streamtube',
  password: process.env.DB_PASSWORD ?? 'streamtube',
  database: process.env.DB_NAME ?? 'streamtube',
});
const storage = new storageModule.StorageService();
const base = 'http://nestjs-api:3000';
const partBytes = 64 * 1024 * 1024;
const inputFile = process.env.SMOKE_INPUT_FILE;
const inputEvidence = inputFile
  ? JSON.parse(await readFile(process.env.SMOKE_INPUT_EVIDENCE, 'utf8'))
  : undefined;
const targetBytes = inputFile
  ? (await stat(inputFile)).size
  : Number(process.env.SMOKE_VIDEO_BYTES ?? partBytes + 1024);
assert.ok(
  Number.isSafeInteger(targetBytes) &&
    targetBytes > partBytes &&
    targetBytes <= 10_000_000_000,
  'SMOKE_VIDEO_BYTES must exceed 64 MiB and be at most 10 GB decimal',
);
const startedAt = Date.now();
const userId = randomUUID();
const channelId = randomUUID();
const directory = await mkdtemp(join(tmpdir(), 'vertice-smoke-'));
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const token = jwt.sign(
  { sub: userId, email: `${userId}@example.test`, jti: randomUUID() },
  { expiresIn: '5h' },
);
const latencySamples = [];
let monitoring = false;
let sourceHandle;
async function sampleApi() {
  if (monitoring) return;
  monitoring = true;
  const start = performance.now();
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
    await response.arrayBuffer();
    latencySamples.push({
      status: response.status,
      ms: performance.now() - start,
    });
  } catch (error) {
    latencySamples.push({
      status: 0,
      error: String(error),
      ms: performance.now() - start,
    });
  } finally {
    monitoring = false;
  }
}
const monitor = inputFile
  ? setInterval(() => void sampleApi(), 2000)
  : undefined;

async function post(path, body, status) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  assert.equal(
    response.status,
    status,
    `${path}: ${await response.clone().text()}`,
  );
  return response.json();
}

try {
  await db.initialize();
  await db.query(
    'INSERT INTO users(id,email,password,is_confirmed) VALUES($1,$2,$3,true)',
    [userId, `${userId}@example.test`, 'unused-test-fixture'],
  );
  await db.query(
    'INSERT INTO channels(id,user_id,name,nickname) VALUES($1,$2,$3,$4)',
    [channelId, userId, 'Separate worker smoke', channelId],
  );
  let prefix;
  if (inputFile) {
    assert.equal(inputEvidence.bytes, targetBytes);
    assert.ok(inputEvidence.media.av_fraction > 0.999);
    assert.equal(inputEvidence.media.full_decode.passed, true);
    sourceHandle = await open(inputFile, 'r');
  } else {
    const filename = join(directory, 'sample.mp4');
    await promisify(execFile)('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=10',
      '-t',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      filename,
    ]);
    const sample = await readFile(filename);
    // A valid ISO BMFF `free` atom pads the synthetic one-second MP4. The bytes
    // really cross S3 multipart and original download; this is an I/O/size test,
    // not a benchmark of ten gigabytes of encoded frames. No large source file
    // is written, and at most one 64 MiB upload part is allocated at a time.
    const paddingBytes = targetBytes - sample.length;
    const paddingHeader = Buffer.alloc(paddingBytes > 0xffffffff ? 16 : 8);
    paddingHeader.writeUInt32BE(
      paddingHeader.length === 16 ? 1 : paddingBytes,
      0,
    );
    paddingHeader.write('free', 4, 'ascii');
    if (paddingHeader.length === 16)
      paddingHeader.writeBigUInt64BE(BigInt(paddingBytes), 8);
    prefix = Buffer.concat([sample, paddingHeader]);
  }
  const draft = await post(
    '/videos/uploads',
    {
      title: 'Separate worker smoke',
      filename: inputFile ? 'tears-of-steel-dnxhd.mov' : 'sample.mp4',
      contentType: inputFile ? 'video/quicktime' : 'video/mp4',
      byteSize: targetBytes,
    },
    201,
  );
  assert.equal(draft.partSize, partBytes);
  assert.equal(draft.partCount, Math.ceil(targetBytes / partBytes));
  const uploadedHash = createHash('sha256');
  const parts = [];
  for (let first = 1; first <= draft.partCount; first += 16) {
    const numbers = Array.from(
      { length: Math.min(16, draft.partCount - first + 1) },
      (_, index) => first + index,
    );
    const signed = await post(
      `/videos/${draft.id}/upload-parts`,
      { partNumbers: numbers },
      200,
    );
    for (const part of signed) {
      const offset = (part.partNumber - 1) * partBytes;
      const bytes = Buffer.alloc(Math.min(partBytes, targetBytes - offset));
      if (sourceHandle) {
        let read = 0;
        while (read < bytes.length) {
          const result = await sourceHandle.read(
            bytes,
            read,
            bytes.length - read,
            offset + read,
          );
          assert.ok(result.bytesRead > 0, 'Unexpected input EOF');
          read += result.bytesRead;
        }
      } else if (offset < prefix.length)
        prefix.copy(
          bytes,
          0,
          offset,
          Math.min(prefix.length, offset + bytes.length),
        );
      uploadedHash.update(bytes);
      const upload = await fetch(part.url, {
        method: 'PUT',
        body: bytes,
        headers: { 'content-length': String(bytes.length) },
      });
      assert.equal(upload.status, 200, `Upload part ${part.partNumber}`);
      const etag = upload.headers.get('etag');
      assert.ok(etag, `ETag for part ${part.partNumber}`);
      parts.push({ partNumber: part.partNumber, etag });
      if (part.partNumber % 10 === 0 || part.partNumber === draft.partCount)
        console.log(
          `Uploaded ${part.partNumber}/${draft.partCount} parts (${Math.min(targetBytes, offset + bytes.length)} bytes)`,
        );
    }
  }
  const expectedHash = uploadedHash.digest('hex');
  if (inputFile) assert.equal(expectedHash, inputEvidence.sha256);
  const completedAt = Date.now();
  await post(`/videos/${draft.id}/complete`, { parts }, 202);

  let video;
  const processingDeadline =
    Date.now() + Number(process.env.SMOKE_TIMEOUT_MS ?? 600_000);
  while (Date.now() < processingDeadline) {
    [video] = await db.query(
      'SELECT status,duration_seconds FROM videos WHERE id=$1',
      [draft.id],
    );
    if (['ready', 'failed'].includes(video?.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(
    video?.status,
    'ready',
    'Independent worker must consume and finish the upload',
  );
  assert.ok(video.duration_seconds > 0);
  const readyAt = Date.now();
  const metadata = await fetch(`${base}/videos/${draft.slug}`);
  assert.equal(metadata.status, 200);
  assert.equal(Object.hasOwn(await metadata.json(), 'source_key'), false);
  const stream = await fetch(`${base}/videos/${draft.slug}/stream`, {
    headers: { range: 'bytes=0-31' },
  });
  assert.equal(stream.status, 206);
  assert.equal((await stream.arrayBuffer()).byteLength, 32);
  const thumbnail = await fetch(`${base}/videos/${draft.slug}/thumbnail`);
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get('content-type'), /image\/jpeg/);
  const download = await fetch(`${base}/videos/${draft.slug}/download`);
  assert.equal(download.status, 200);
  assert.equal(Number(download.headers.get('content-length')), targetBytes);
  const downloadedHash = createHash('sha256');
  let downloadedBytes = 0;
  for await (const chunk of download.body) {
    downloadedHash.update(chunk);
    downloadedBytes += chunk.length;
  }
  assert.equal(downloadedBytes, targetBytes);
  assert.equal(downloadedHash.digest('hex'), expectedHash);
  if (inputFile) {
    const queue = new Queue('video-processing', {
      connection: queueConfig.videoQueueConnection(),
    });
    let queueEvidence;
    try {
      const deadline = Date.now() + 30_000;
      let state;
      let job;
      do {
        job = await queue.getJob(`video-${draft.id}`);
        state = await job?.getState();
        if (state === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } while (Date.now() < deadline);
      assert.equal(state, 'completed');
      assert.equal(job.attemptsMade, 1, 'No hidden failed attempt');
      assert.equal(job.attemptsStarted, 1, 'No hidden stalled restart');
      queueEvidence = {
        state,
        attemptsMade: job.attemptsMade,
        attemptsStarted: job.attemptsStarted,
      };
    } finally {
      await queue.close();
    }
    const thumbnailPath = join(directory, 'thumbnail.jpg');
    const thumbnailBytes = Buffer.from(await thumbnail.arrayBuffer());
    assert.equal(thumbnailBytes.subarray(0, 2).toString('hex'), 'ffd8');
    await writeFile(thumbnailPath, thumbnailBytes);
    await promisify(execFile)(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-xerror',
        '-i',
        thumbnailPath,
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ],
      { timeout: 60_000 },
    );
    const playbackPath = join(directory, 'playback.mp4');
    const playback = await fetch(`${base}/videos/${draft.slug}/stream`);
    assert.equal(playback.status, 200);
    const playbackSize = Number(playback.headers.get('content-length'));
    await pipeline(
      Readable.fromWeb(playback.body),
      createWriteStream(playbackPath),
    );
    assert.equal((await stat(playbackPath)).size, playbackSize);
    const { stdout, stderr } = await promisify(execFile)(
      'python3',
      ['scripts/inspect-media.py', playbackPath, '--decode', '--atoms'],
      { timeout: 70 * 60 * 1000, maxBuffer: 1024 * 1024 },
    );
    if (stderr) console.log(stderr);
    const rendered = JSON.parse(stdout);
    const sourceVideo = inputEvidence.media.streams.find(
      (s) => s.codec_type === 'video',
    );
    const renderedVideo = rendered.streams.find(
      (s) => s.codec_type === 'video',
    );
    assert.equal(renderedVideo.codec_name, 'h264');
    const sourceAudio = inputEvidence.media.streams.find(
      (s) => s.codec_type === 'audio',
    );
    const renderedAudio = rendered.streams.find(
      (s) => s.codec_type === 'audio',
    );
    assert.ok(
      Math.abs(Number(renderedAudio?.duration) - Number(sourceAudio.duration)) <
        1,
      'Audio must retain the complete duration',
    );
    assert.equal(
      rendered.streams.find((s) => s.codec_type === 'audio')?.codec_name,
      'aac',
    );
    assert.equal(renderedVideo.width, sourceVideo.width);
    assert.equal(renderedVideo.height, sourceVideo.height);
    assert.equal(
      rendered.full_decode.frames,
      inputEvidence.media.full_decode.frames,
    );
    assert.ok(
      Math.abs(
        Number(rendered.format.duration) -
          Number(inputEvidence.media.format.duration),
      ) < 1,
    );
    assert.ok(
      Math.abs(
        Number(video.duration_seconds) -
          Number(inputEvidence.media.format.duration),
      ) < 1,
    );
    const moovIndex = rendered.atoms.findIndex((a) => a.type === 'moov');
    const mdatIndex = rendered.atoms.findIndex((a) => a.type === 'mdat');
    assert.ok(
      moovIndex >= 0 && mdatIndex >= 0 && moovIndex < mdatIndex,
      'Playback must have faststart',
    );
    const playbackHandle = await open(playbackPath, 'r');
    const ranges = [];
    try {
      for (const offset of [
        0,
        Math.floor(playbackSize / 2),
        playbackSize - 1024,
      ]) {
        const end = offset + 1023;
        const response = await fetch(`${base}/videos/${draft.slug}/stream`, {
          headers: { range: `bytes=${offset}-${end}` },
        });
        assert.equal(response.status, 206);
        assert.equal(
          response.headers.get('content-range'),
          `bytes ${offset}-${end}/${playbackSize}`,
        );
        const bytes = Buffer.from(await response.arrayBuffer());
        const expected = Buffer.alloc(1024);
        assert.equal(
          (await playbackHandle.read(expected, 0, 1024, offset)).bytesRead,
          1024,
        );
        assert.deepEqual(bytes, expected);
        ranges.push({ offset, end, status: response.status, bytesMatch: true });
      }
    } finally {
      await playbackHandle.close();
    }
    clearInterval(monitor);
    while (monitoring) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(latencySamples.length > 0);
    assert.ok(
      latencySamples.every((s) => s.status === 200 && s.ms < 5000),
      'API must remain responsive',
    );
    const sorted = latencySamples.map((s) => s.ms).sort((a, b) => a - b);
    const report = {
      passed: true,
      input: inputEvidence,
      uploadedBytes: targetBytes,
      multipartParts: parts.length,
      originalDownloadSha256: expectedHash,
      originalDownloadBytes: downloadedBytes,
      playback: rendered,
      queue: queueEvidence,
      ranges,
      thumbnail: {
        status: thumbnail.status,
        contentType: thumbnail.headers.get('content-type'),
        decoded: true,
      },
      apiLatency: {
        samples: sorted.length,
        maxMs: sorted.at(-1),
        p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
        failures: 0,
      },
      elapsedMs: Date.now() - startedAt,
      processingMs: readyAt - completedAt,
      afterCompleteElapsedMs: Date.now() - completedAt,
    };
    await writeFile(
      process.env.SMOKE_REPORT_FILE,
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log('REAL_MEDIA_RESULT ' + JSON.stringify(report));
  }
  console.log(
    `PASS: separate API + video-worker containers; ${targetBytes} physical bytes in ${parts.length} multipart parts; queue, FFmpeg, thumbnail, Range and original download SHA-256=${expectedHash}; elapsed=${Date.now() - startedAt}ms`,
  );
} finally {
  if (monitor) clearInterval(monitor);
  if (sourceHandle) await sourceHandle.close();
  if (db.isInitialized) {
    const rows = await db.query(
      'SELECT source_key,playback_key,thumbnail_key,upload_id FROM videos WHERE channel_id=$1',
      [channelId],
    );
    for (const row of rows) {
      if (row.upload_id) await storage.abort(row.source_key, row.upload_id);
      for (const key of [row.source_key, row.playback_key, row.thumbnail_key])
        if (key) await storage.remove(key);
    }
    await db.query('DELETE FROM channels WHERE id=$1', [channelId]);
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.destroy();
  }
  storage.onModuleDestroy();
  await rm(directory, { recursive: true, force: true });
}
