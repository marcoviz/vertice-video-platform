import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VideosRepository } from './videos.repository';
import { StorageService } from './storage.service';
import { VideoException } from './video.exception';
import { PART_BYTES } from './video.constants';
import { partCount, partLength, verifyParts } from './upload-policy';
import type { StartUploadDto } from './dto/start-upload.dto';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import { Video } from './entities/video.entity';
import type {
  UploadSessionDto,
  SignedPartDto,
  VideoStatusDto,
  OwnerVideoStatusDto,
  PublicVideoDto,
} from './dto/video-responses.dto';

@Injectable()
export class VideosService {
  constructor(
    private readonly repo: VideosRepository,
    private readonly storage: StorageService,
  ) {}
  async start(userId: string, dto: StartUploadDto): Promise<UploadSessionDto> {
    partLength(dto.byteSize, 1);
    if (!dto.title.trim())
      throw new VideoException('INVALID_UPLOAD', 422, 'Title cannot be blank');
    const channelId = await this.repo.channelId(userId);
    const id = randomUUID();
    const video = await this.repo.create({
      id,
      slug: randomUUID(),
      channel_id: channelId,
      title: dto.title.trim(),
      filename: dto.filename,
      content_type: dto.contentType,
      byte_size: String(dto.byteSize),
      status: 'draft',
      source_key: `channels/${channelId}/${id}/source`,
      upload_id: null,
    });
    // The first signing call initializes S3 under the draft row lock.
    return {
      id,
      slug: video.slug,
      status: 'draft',
      partSize: PART_BYTES,
      partCount: partCount(dto.byteSize),
    };
  }
  async sign(
    userId: string,
    id: string,
    numbers: number[],
  ): Promise<SignedPartDto[]> {
    return this.repo.lockOwned(id, userId, async (video, manager) => {
      this.requireDraft(video);
      if (!video.upload_id) {
        video.upload_id = await this.storage.initiate(
          video.source_key,
          video.content_type,
        );
        await manager.save(video);
      }
      return Promise.all(
        numbers.map(async (number) => ({
          partNumber: number,
          url: await this.storage.signPart(
            video.source_key,
            video.upload_id!,
            number,
            partLength(Number(video.byte_size), number),
          ),
        })),
      );
    });
  }
  async complete(
    userId: string,
    id: string,
    dto: CompleteUploadDto,
  ): Promise<VideoStatusDto> {
    return this.repo.lockOwned(id, userId, async (video, manager) => {
      if (video.status === 'processing' || video.status === 'ready')
        return { id: video.id, status: video.status };
      this.requireDraft(video);
      let actual = await this.storage.head(video.source_key);
      if (actual === null) {
        if (!video.upload_id)
          throw new VideoException(
            'INVALID_UPLOAD',
            422,
            'Upload has not started',
          );
        verifyParts(
          Number(video.byte_size),
          dto.parts,
          await this.storage.parts(video.source_key, video.upload_id),
        );
        await this.storage.complete(
          video.source_key,
          video.upload_id,
          dto.parts,
        );
        actual = await this.storage.head(video.source_key);
      }
      if (actual !== Number(video.byte_size))
        throw new VideoException(
          'UPLOAD_MISMATCH',
          422,
          'Stored file size does not match declaration',
        );
      video.status = 'processing';
      video.upload_id = null;
      video.queued_at = null;
      await manager.save(video);
      return { id: video.id, status: video.status };
    });
  }
  async abort(userId: string, id: string): Promise<void> {
    await this.repo.lockOwned(id, userId, async (video, manager) => {
      this.requireDraft(video);
      if (video.upload_id)
        await this.storage.abort(video.source_key, video.upload_id);
      await this.storage.remove(video.source_key);
      await manager.remove(video);
    });
  }
  async status(userId: string, id: string): Promise<OwnerVideoStatusDto> {
    const video = await this.repo.owned(id, userId);
    return {
      id: video.id,
      slug: video.slug,
      status: video.status,
      errorCode: video.error_code,
    };
  }
  async metadata(slug: string): Promise<PublicVideoDto> {
    const video = await this.repo.publicVideo(slug);
    return {
      id: video.id,
      slug: video.slug,
      title: video.title,
      channelId: video.channel_id,
      durationSeconds: video.duration_seconds,
      metadata: video.metadata,
      streamUrl: `/videos/${video.slug}/stream`,
      downloadUrl: `/videos/${video.slug}/download`,
      thumbnailUrl: `/videos/${video.slug}/thumbnail`,
    };
  }
  async media(
    slug: string,
    kind: 'stream' | 'download' | 'thumbnail',
  ): Promise<string> {
    const video = await this.repo.publicVideo(slug);
    const key =
      kind === 'download'
        ? video.source_key
        : kind === 'stream'
          ? video.playback_key
          : video.thumbnail_key;
    if (!key)
      throw new VideoException(
        'VIDEO_NOT_READY',
        409,
        'Video output is unavailable',
      );
    return this.storage.url(
      key,
      kind === 'download' ? video.filename : undefined,
    );
  }
  private requireDraft(video: Video): void {
    if (video.status !== 'draft')
      throw new VideoException(
        'INVALID_VIDEO_STATE',
        409,
        'Only a draft upload can be changed',
      );
  }
}
