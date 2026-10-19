import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Video } from './entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { VideoException } from './video.exception';

@Injectable()
export class VideosRepository {
  constructor(
    @InjectRepository(Video) private readonly repo: Repository<Video>,
    private readonly db: DataSource,
  ) {}
  async channelId(userId: string): Promise<string> {
    const channel = await this.db
      .getRepository(Channel)
      .findOneBy({ user_id: userId });
    if (!channel)
      throw new VideoException('VIDEO_NOT_FOUND', 404, 'Channel not found');
    return channel.id;
  }
  async create(data: Partial<Video>): Promise<Video> {
    return this.repo.save(this.repo.create(data));
  }
  async find(id: string): Promise<Video | null> {
    return this.repo.findOneBy({ id });
  }
  async publicVideo(slug: string): Promise<Video> {
    const video = await this.repo.findOneBy({ slug, status: 'ready' });
    if (!video)
      throw new VideoException('VIDEO_NOT_FOUND', 404, 'Video not found');
    return video;
  }
  async owned(id: string, userId: string): Promise<Video> {
    const video = await this.repo.findOne({
      where: { id, channel: { user_id: userId } },
    });
    if (!video)
      throw new VideoException('VIDEO_NOT_FOUND', 404, 'Video not found');
    return video;
  }
  async lockOwned<T>(
    id: string,
    userId: string,
    action: (video: Video, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      // Lock only the video; no nullable joined relation in SELECT FOR UPDATE.
      const video = await manager.findOne(Video, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !video ||
        !(await manager.findOneBy(Channel, {
          id: video.channel_id,
          user_id: userId,
        }))
      )
        throw new VideoException('VIDEO_NOT_FOUND', 404, 'Video not found');
      return action(video, manager);
    });
  }
  async update(id: string, patch: Partial<Video>): Promise<void> {
    await this.repo.update(id, patch);
  }
  async pending(): Promise<Video[]> {
    return this.repo.find({
      where: { status: 'processing', queued_at: IsNull() },
      take: 50,
      order: { created_at: 'ASC' },
    });
  }
}
