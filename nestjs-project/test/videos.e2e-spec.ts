import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { User } from '../src/users/entities/user.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import { Video } from '../src/videos/entities/video.entity';
import { VideosModule } from '../src/videos/videos.module';
import { StorageService } from '../src/videos/storage.service';
import { FfmpegService } from '../src/videos/processing/ffmpeg.service';
import { VideoProcessorService } from '../src/videos/processing/video-processor.service';
import { VideoQueueService } from '../src/videos/processing/video-queue.service';

const execute = promisify(execFile);
jest.setTimeout(120_000);
describe('Videos (real HTTP, Postgres, MinIO, BullMQ/Redis and FFmpeg)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let queue: VideoQueueService;
  let token: string;
  let ownerId: string;
  let channelId: string;
  let directory: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, VideosModule],
      providers: [FfmpegService, VideoProcessorService, VideoQueueService],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();
    db = app.get(DataSource);
    queue = app.get(VideoQueueService);
    const owner = await db.getRepository(User).save({
      email: `${randomUUID()}@example.test`,
      password: 'unused',
      is_confirmed: true,
    });
    ownerId = owner.id;
    const channel = await db
      .getRepository(Channel)
      .save({ name: 'Video tests', nickname: randomUUID(), user_id: owner.id });
    channelId = channel.id;
    token = await app
      .get(JwtService)
      .signAsync({ sub: owner.id, email: owner.email, jti: randomUUID() });
    directory = await mkdtemp(join(tmpdir(), 'vertice-e2e-'));
  });
  beforeEach(() =>
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown(),
  );
  afterAll(async () => {
    if (queue) await queue.onModuleDestroy();
    if (db?.isInitialized && channelId) {
      const storage = app.get(StorageService);
      for (const video of await db
        .getRepository(Video)
        .findBy({ channel_id: channelId })) {
        for (const key of [
          video.source_key,
          video.playback_key,
          video.thumbnail_key,
        ])
          if (key) await storage.remove(key);
      }
      await db.getRepository(Channel).delete(channelId);
      await db.getRepository(User).delete(ownerId);
    }
    if (directory) await rm(directory, { recursive: true, force: true });
    if (app) await app.close();
  });
  it('rejects anonymous uploads and declared sizes above 10GB', async () => {
    await request(app.getHttpServer())
      .post('/videos/uploads')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/videos/uploads')
      .auth(token, { type: 'bearer' })
      .send({
        title: 'Too big',
        filename: 'x.mp4',
        contentType: 'video/mp4',
        byteSize: 10_000_000_001,
      })
      .expect(400);
  });
  it('accepts a 10GB draft without allocating memory or transferring bytes', async () => {
    const draft = await request(app.getHttpServer())
      .post('/videos/uploads')
      .auth(token, { type: 'bearer' })
      .send({
        title: 'Boundary',
        filename: 'large.mp4',
        contentType: 'video/mp4',
        byteSize: 10_000_000_000,
      })
      .expect(201);
    expect((draft.body as { partCount: number }).partCount).toBe(150);
    await request(app.getHttpServer())
      .delete(`/videos/${(draft.body as { id: string }).id}/upload`)
      .auth(token, { type: 'bearer' })
      .expect(204);
  });
  it('processes an upload through the queue, provides range streaming and download', async () => {
    const path = join(directory, 'sample.mp4');
    await execute('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-y',
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
      path,
    ]);
    const bytes = await readFile(path);
    const draft = await request(app.getHttpServer())
      .post('/videos/uploads')
      .auth(token, { type: 'bearer' })
      .send({
        title: 'Real pipeline',
        filename: 'sample.mp4',
        contentType: 'video/mp4',
        byteSize: bytes.length,
      })
      .expect(201);
    const { id, slug } = draft.body as { id: string; slug: string };
    await request(app.getHttpServer()).get(`/videos/${slug}`).expect(404);
    const outsider = await app.get(JwtService).signAsync({
      sub: randomUUID(),
      email: 'outsider@example.test',
      jti: randomUUID(),
    });
    await request(app.getHttpServer())
      .post(`/videos/${id}/upload-parts`)
      .auth(outsider, { type: 'bearer' })
      .send({ partNumbers: [1] })
      .expect(404);
    const signed = await request(app.getHttpServer())
      .post(`/videos/${id}/upload-parts`)
      .auth(token, { type: 'bearer' })
      .send({ partNumbers: [1] })
      .expect(200);
    const put = await fetch((signed.body as { url: string }[])[0].url, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-length': String(bytes.length) },
    });
    expect(put.ok).toBe(true);
    const etag = put.headers.get('etag');
    await request(app.getHttpServer())
      .post(`/videos/${id}/complete`)
      .auth(token, { type: 'bearer' })
      .send({ parts: [{ partNumber: 1, etag }] })
      .expect(202);
    await queue.dispatch();
    let video: Video | null = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      video = await db.getRepository(Video).findOneBy({ id });
      if (video?.status === 'ready' || video?.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(video?.status).toBe('ready');
    expect(video?.duration_seconds).toBeGreaterThan(0);
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    const metadata = await request(app.getHttpServer())
      .get(`/videos/${slug}`)
      .expect(200);
    expect(metadata.body).not.toHaveProperty('source_key');
    const stream = await request(app.getHttpServer())
      .get(`/videos/${slug}/stream`)
      .set('range', 'bytes=0-31')
      .expect(307);
    const chunk = await fetch(stream.headers.location, {
      headers: { range: 'bytes=0-31' },
    });
    expect(chunk.status).toBe(206);
    expect((await chunk.arrayBuffer()).byteLength).toBe(32);
    const thumb = await request(app.getHttpServer())
      .get(`/videos/${slug}/thumbnail`)
      .expect(307);
    const image = await fetch(thumb.headers.location);
    expect(image.headers.get('content-type')).toContain('image/jpeg');
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const download = await request(app.getHttpServer())
      .get(`/videos/${slug}/download`)
      .expect(307);
    const original = await fetch(download.headers.location);
    expect(original.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
  });
  it('retries invalid video bytes and persists terminal failure without publishing', async () => {
    const bytes = Buffer.from('This is not a video stream');
    const draft = await request(app.getHttpServer())
      .post('/videos/uploads')
      .auth(token, { type: 'bearer' })
      .send({
        title: 'Invalid content',
        filename: 'broken.mp4',
        contentType: 'video/mp4',
        byteSize: bytes.length,
      })
      .expect(201);
    const { id, slug } = draft.body as { id: string; slug: string };
    const signed = await request(app.getHttpServer())
      .post(`/videos/${id}/upload-parts`)
      .auth(token, { type: 'bearer' })
      .send({ partNumbers: [1] })
      .expect(200);
    const put = await fetch((signed.body as { url: string }[])[0].url, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-length': String(bytes.length) },
    });
    expect(put.ok).toBe(true);
    await request(app.getHttpServer())
      .post(`/videos/${id}/complete`)
      .auth(token, { type: 'bearer' })
      .send({ parts: [{ partNumber: 1, etag: put.headers.get('etag') }] })
      .expect(202);
    await queue.dispatch();
    let video: Video | null = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      video = await db.getRepository(Video).findOneBy({ id });
      if (video?.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(video?.status).toBe('failed');
    expect(video?.error_code).toBe('PROCESSING_FAILED');
    expect(video?.playback_key).toBeNull();
    await request(app.getHttpServer()).get(`/videos/${slug}`).expect(404);
  });
});
