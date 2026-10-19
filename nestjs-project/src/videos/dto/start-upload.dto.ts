import {
  IsIn,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';
import { MAX_VIDEO_BYTES, VIDEO_TYPES } from '../video.constants';
export class StartUploadDto {
  @IsString() @Length(1, 160) title: string;
  @IsString()
  @Length(1, 180)
  @Matches(/^[\p{L}\p{N} ._()-]+$/u)
  filename: string;
  @IsIn(VIDEO_TYPES) contentType: string;
  @IsInt() @Min(1) @Max(MAX_VIDEO_BYTES) byteSize: number;
}
