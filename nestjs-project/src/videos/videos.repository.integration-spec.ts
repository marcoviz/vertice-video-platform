import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Video } from './entities/video.entity';
import { createTestDataSource } from '../test/create-test-data-source';
import { VideosRepository } from './videos.repository';
describe('VideosRepository (real Postgres)', () => {
  let db: DataSource;
  let repo: VideosRepository;
  let module: TestingModule;
  let user: User;
  let channel: Channel;
  beforeAll(async () => {
    db = createTestDataSource([User, Channel, Video]);
    await db.initialize();
    module = await Test.createTestingModule({
      providers: [
        VideosRepository,
        { provide: DataSource, useValue: db },
        {
          provide: getRepositoryToken(Video),
          useValue: db.getRepository(Video),
        },
      ],
    }).compile();
    repo = module.get(VideosRepository);
    user = await db.getRepository(User).save({
      email: `${randomUUID()}@example.test`,
      password: 'test-only',
      is_confirmed: true,
    });
    channel = await db
      .getRepository(Channel)
      .save({ user_id: user.id, name: 'Video tests', nickname: randomUUID() });
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.getRepository(Channel).delete(channel.id);
      await db.getRepository(User).delete(user.id);
      await db.destroy();
    }
    if (module) await module.close();
  });
  it('enforces unique URL, ownership and the processing outbox', async () => {
    const video = await repo.create({
      slug: randomUUID(),
      channel_id: channel.id,
      title: 'Sample',
      filename: 'sample.mp4',
      content_type: 'video/mp4',
      byte_size: '12',
      source_key: randomUUID(),
      status: 'draft',
    });
    await expect(repo.owned(video.id, randomUUID())).rejects.toThrow(
      'not found',
    );
    expect((await repo.owned(video.id, user.id)).id).toBe(video.id);
    await expect(
      repo.create({
        slug: video.slug,
        channel_id: channel.id,
        title: 'Duplicate',
        filename: 'x',
        content_type: 'video/mp4',
        byte_size: '12',
        source_key: randomUUID(),
      }),
    ).rejects.toThrow();
    await repo.lockOwned(video.id, user.id, async (row, manager) => {
      row.status = 'processing';
      await manager.save(row);
    });
    expect((await repo.pending()).some((row) => row.id === video.id)).toBe(
      true,
    );
    await repo.update(video.id, { queued_at: new Date() });
    expect((await repo.pending()).some((row) => row.id === video.id)).toBe(
      false,
    );
    await expect(repo.publicVideo(video.slug)).rejects.toThrow('not found');
  });
});
