import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { User } from '../../users/entities/user.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { createTestDataSource } from '../../test/create-test-data-source';
import { Video } from '../entities/video.entity';
import { VideosRepository } from '../videos.repository';
import { VIDEO_ATTEMPTS } from '../video.constants';
import { VideoQueueService } from './video-queue.service';
import { VIDEO_QUEUE_NAME, videoQueueConnection } from './video-queue.config';

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for real queue state');
}

describe('Video queue reconciliation (real Postgres, Redis and worker crashes)', () => {
  jest.setTimeout(30_000);
  let db: DataSource;
  let user: User;
  let channel: Channel;
  let name: string;
  let jobs: Queue;
  let modules: TestingModule[];
  let workers: Worker[];
  let children: ChildProcess[];

  beforeAll(async () => {
    db = createTestDataSource([User, Channel, Video]);
    await db.initialize();
    user = await db.getRepository(User).save({
      email: `${randomUUID()}@example.test`,
      password: 'test-only',
      is_confirmed: true,
    });
    channel = await db
      .getRepository(Channel)
      .save({ user_id: user.id, name: 'Queue tests', nickname: randomUUID() });
  });
  beforeEach(async () => {
    name = `video-reconcile-${randomUUID()}`;
    jobs = new Queue(name, { connection: videoQueueConnection() });
    modules = [];
    workers = [];
    children = [];
    await db.getRepository(Video).delete({ channel_id: channel.id });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    }
    for (const module of modules) await module.close();
    for (const worker of workers) await worker.close();
    await jobs.obliterate({ force: true });
    await jobs.close();
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.getRepository(Channel).delete(channel.id);
      await db.getRepository(User).delete(user.id);
      await db.destroy();
    }
  });

  async function video(): Promise<Video> {
    return db.getRepository(Video).save({
      slug: randomUUID(),
      channel_id: channel.id,
      title: 'Recovery',
      filename: 'recovery.mp4',
      content_type: 'video/mp4',
      byte_size: '12',
      source_key: randomUUID(),
      status: 'processing',
      queued_at: new Date(),
    });
  }
  async function reconciler(): Promise<TestingModule> {
    const module = await Test.createTestingModule({
      providers: [
        VideoQueueService,
        VideosRepository,
        { provide: DataSource, useValue: db },
        {
          provide: getRepositoryToken(Video),
          useValue: db.getRepository(Video),
        },
        { provide: VIDEO_QUEUE_NAME, useValue: name },
      ],
    }).compile();
    modules.push(module);
    return module;
  }
  async function killActiveWorker(): Promise<void> {
    const child = fork(join(__dirname, 'fixtures/stalled-worker.cjs'), [name], {
      execArgv: [],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    children.push(child);
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Worker never became active: ${stderr}`)),
        10_000,
      );
      child.once('message', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (_code, signal) => {
        clearTimeout(timer);
        reject(
          new Error(`Worker exited before interruption: ${signal}; ${stderr}`),
        );
      });
    });
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }

  it('recovers a terminal stall after two killed workers even when the failure event was missed', async () => {
    const row = await video();
    const id = `video-${row.id}`;
    await jobs.add(
      'process',
      { videoId: row.id },
      { jobId: id, attempts: VIDEO_ATTEMPTS, removeOnFail: false },
    );
    await killActiveWorker();
    await killActiveWorker();
    const processJob = jest.fn(() => Promise.resolve(undefined));
    const survivor = new Worker(name, processJob, {
      connection: videoQueueConnection(),
      lockDuration: 300,
      stalledInterval: 200,
      maxStalledCount: 1,
    });
    workers.push(survivor);
    await waitUntil(async () => (await jobs.getJobState(id)) === 'failed');
    const failed = await jobs.getJob(id);
    expect(failed?.failedReason).toContain('stalled more than allowable limit');
    expect(failed!.attemptsMade).toBeLessThan(VIDEO_ATTEMPTS);
    expect(processJob).not.toHaveBeenCalled();
    await survivor.close();
    const module = await reconciler();
    await module.init();
    expect(
      await db.getRepository(Video).findOneBy({ id: row.id }),
    ).toMatchObject({ status: 'failed', error_code: 'PROCESSING_FAILED' });
  });

  it('retries a failed terminal write after restarting the reconciler without a new event', async () => {
    const row = await video();
    const id = `video-${row.id}`;
    await jobs.add(
      'process',
      { videoId: row.id },
      { jobId: id, attempts: 1, removeOnFail: false },
    );
    const worker = new Worker(
      name,
      () => Promise.reject(new Error('terminal test failure')),
      { connection: videoQueueConnection() },
    );
    workers.push(worker);
    await waitUntil(async () => (await jobs.getJobState(id)) === 'failed');
    await worker.close();
    const initial = await reconciler();
    const failure = jest
      .spyOn(initial.get(VideosRepository), 'updateProcessing')
      .mockRejectedValueOnce(new Error('temporary database write failure'));
    await initial.init();
    expect(failure).toHaveBeenCalledTimes(1);
    expect(
      (await db.getRepository(Video).findOneBy({ id: row.id }))?.status,
    ).toBe('processing');
    await initial.close();
    const restarted = await reconciler();
    await restarted.init();
    expect(
      (await db.getRepository(Video).findOneBy({ id: row.id }))?.status,
    ).toBe('failed');
  });

  it('keeps polling after a temporary database failure during startup', async () => {
    const row = await video();
    const module = await reconciler();
    jest
      .spyOn(module.get(VideosRepository), 'processingBatch')
      .mockRejectedValueOnce(new Error('temporary startup database failure'));
    await module.init();
    expect(await jobs.getJobState(`video-${row.id}`)).toBe('unknown');
    await waitUntil(
      async () => (await jobs.getJobState(`video-${row.id}`)) === 'waiting',
    );
    expect(
      (await db.getRepository(Video).findOneBy({ id: row.id }))?.status,
    ).toBe('processing');
  });

  it('does not leave a completed job processing when its media result was not persisted', async () => {
    const row = await video();
    const id = `video-${row.id}`;
    await jobs.add(
      'process',
      { videoId: row.id },
      { jobId: id, removeOnComplete: false },
    );
    const worker = new Worker(name, () => Promise.resolve(undefined), {
      connection: videoQueueConnection(),
    });
    workers.push(worker);
    await waitUntil(async () => (await jobs.getJobState(id)) === 'completed');
    await worker.close();
    const module = await reconciler();
    await module.init();
    expect(
      (await db.getRepository(Video).findOneBy({ id: row.id }))?.status,
    ).toBe('failed');
  });

  it('republishes a missing job safely with concurrent reconcilers and preserves processing while waiting', async () => {
    const row = await video();
    const first = await reconciler();
    const second = await reconciler();
    await Promise.all([first.init(), second.init()]);
    const waiting = await jobs.getJobs(['waiting']);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].id).toBe(`video-${row.id}`);
    expect(
      (await db.getRepository(Video).findOneBy({ id: row.id }))?.status,
    ).toBe('processing');
  });
});
