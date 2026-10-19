import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { Video } from './entities/video.entity';
import { VideosRepository } from './videos.repository';
import { StorageService } from './storage.service';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Video, Channel])],
  controllers: [VideosController],
  providers: [VideosRepository, StorageService, VideosService],
  exports: [VideosRepository, StorageService],
})
export class VideosModule {}
