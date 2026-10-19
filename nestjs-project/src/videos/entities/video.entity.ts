import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import type { VideoStatus } from '../video.constants';

@Entity('videos')
@Check('CHK_videos_byte_size', '"byte_size" BETWEEN 1 AND 10000000000')
@Check(
  'CHK_videos_status',
  "\"status\" IN ('draft','processing','ready','failed')",
)
export class Video {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', unique: true }) slug: string;
  @Column({ type: 'uuid' }) channel_id: string;
  @ManyToOne(() => Channel, (channel) => channel.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
  @Column({ type: 'varchar', length: 160 }) title: string;
  @Column({ type: 'varchar', length: 180 }) filename: string;
  @Column({ type: 'varchar', length: 80 }) content_type: string;
  @Column({ type: 'bigint' }) byte_size: string;
  @Index('IDX_videos_dispatch')
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: VideoStatus;
  @Column({ type: 'text', unique: true }) source_key: string;
  @Column({ type: 'text', nullable: true }) upload_id: string | null;
  @Column({ type: 'text', nullable: true }) playback_key: string | null;
  @Column({ type: 'text', nullable: true }) thumbnail_key: string | null;
  @Column({ type: 'double precision', nullable: true }) duration_seconds:
    number | null;
  @Column({ type: 'jsonb', nullable: true }) metadata: {
    width: number;
    height: number;
    codec: string;
  } | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) error_code:
    string | null;
  @Column({ type: 'timestamptz', nullable: true }) queued_at: Date | null;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
