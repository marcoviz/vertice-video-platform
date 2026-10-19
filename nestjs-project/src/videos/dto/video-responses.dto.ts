import { ApiProperty } from '@nestjs/swagger';
export class UploadSessionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) slug: string;
  @ApiProperty({ example: 'draft' }) status: string;
  @ApiProperty({ example: 67108864 }) partSize: number;
  @ApiProperty({ example: 150 }) partCount: number;
}
export class SignedPartDto {
  @ApiProperty() partNumber: number;
  @ApiProperty({ description: 'Expiring S3 URL; do not change its hostname' })
  url: string;
}
export class VideoStatusDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['draft', 'processing', 'ready', 'failed'] })
  status: string;
}
export class OwnerVideoStatusDto extends VideoStatusDto {
  @ApiProperty({ format: 'uuid' }) slug: string;
  @ApiProperty({ nullable: true }) errorCode: string | null;
}
export class PublicVideoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ format: 'uuid' }) channelId: string;
  @ApiProperty({ nullable: true }) durationSeconds: number | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  metadata: Record<string, unknown> | null;
  @ApiProperty() streamUrl: string;
  @ApiProperty() downloadUrl: string;
  @ApiProperty() thumbnailUrl: string;
}
