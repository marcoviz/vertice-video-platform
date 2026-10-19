import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import databaseConfig from '../../config/database.config';
import { VideosModule } from '../videos.module';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessorService } from './video-processor.service';
import { VideoQueueService } from './video-queue.service';
import { VideoQueueWorkerService } from './video-queue-worker.service';
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const db = databaseConfig();
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.name,
          entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
          synchronize: false,
        };
      },
    }),
    VideosModule,
  ],
  providers: [
    FfmpegService,
    VideoProcessorService,
    VideoQueueService,
    VideoQueueWorkerService,
  ],
})
export class VideoWorkerModule {}
