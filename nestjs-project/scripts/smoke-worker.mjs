// Runs in a one-off API image while the API and video-worker are separate containers.
// The only direct DB writes are disposable test fixtures and their cleanup.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import storageModule from '../dist/videos/storage.service.js';

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
const userId = randomUUID();
const channelId = randomUUID();
const directory = await mkdtemp(join(tmpdir(), 'vertice-smoke-'));
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const token = jwt.sign({ sub: userId, email: `${userId}@example.test`, jti: randomUUID() }, { expiresIn: '5m' });

async function post(path, body, status) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, status, `${path}: ${await response.clone().text()}`);
  return response.json();
}

try {
  await db.initialize();
  await db.query('INSERT INTO users(id,email,password,is_confirmed) VALUES($1,$2,$3,true)', [userId, `${userId}@example.test`, 'unused-test-fixture']);
  await db.query('INSERT INTO channels(id,user_id,name,nickname) VALUES($1,$2,$3,$4)', [channelId, userId, 'Separate worker smoke', channelId]);
  const filename = join(directory, 'sample.mp4');
  await promisify(execFile)('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-t', '1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', filename]);
  const bytes = await readFile(filename);
  const draft = await post('/videos/uploads', { title: 'Separate worker smoke', filename: 'sample.mp4', contentType: 'video/mp4', byteSize: bytes.length }, 201);
  const signed = await post(`/videos/${draft.id}/upload-parts`, { partNumbers: [1] }, 200);
  const upload = await fetch(signed[0].url, { method: 'PUT', body: bytes, headers: { 'content-length': String(bytes.length) } });
  assert.equal(upload.status, 200);
  await post(`/videos/${draft.id}/complete`, { parts: [{ partNumber: 1, etag: upload.headers.get('etag') }] }, 202);

  let video;
  for (let attempt = 0; attempt < 120; attempt++) {
    [video] = await db.query('SELECT status,duration_seconds FROM videos WHERE id=$1', [draft.id]);
    if (['ready', 'failed'].includes(video?.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(video?.status, 'ready', 'Independent worker must consume and finish the upload');
  assert.ok(video.duration_seconds > 0);
  const metadata = await fetch(`${base}/videos/${draft.slug}`);
  assert.equal(metadata.status, 200);
  assert.equal(Object.hasOwn(await metadata.json(), 'source_key'), false);
  const stream = await fetch(`${base}/videos/${draft.slug}/stream`, { headers: { range: 'bytes=0-31' } });
  assert.equal(stream.status, 206);
  assert.equal((await stream.arrayBuffer()).byteLength, 32);
  const thumbnail = await fetch(`${base}/videos/${draft.slug}/thumbnail`);
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get('content-type'), /image\/jpeg/);
  const download = await fetch(`${base}/videos/${draft.slug}/download`);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  console.log('PASS: separate API + video-worker containers; multipart, queue, FFmpeg, thumbnail, Range and original download');
} finally {
  if (db.isInitialized) {
    const rows = await db.query('SELECT source_key,playback_key,thumbnail_key,upload_id FROM videos WHERE channel_id=$1', [channelId]);
    for (const row of rows) {
      if (row.upload_id) await storage.abort(row.source_key, row.upload_id);
      for (const key of [row.source_key, row.playback_key, row.thumbnail_key]) if (key) await storage.remove(key);
    }
    await db.query('DELETE FROM channels WHERE id=$1', [channelId]);
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.destroy();
  }
  storage.onModuleDestroy();
  await rm(directory, { recursive: true, force: true });
}
