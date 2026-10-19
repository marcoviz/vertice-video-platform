import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
class PartDto {
  @IsInt() @Min(1) @Max(150) partNumber: number;
  @IsString() @Length(1, 200) etag: string;
}
export class CompleteUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(150)
  @ValidateNested({ each: true })
  @Type(() => PartDto)
  parts: PartDto[];
}
