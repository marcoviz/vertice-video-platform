import {
  UploadSessionDto,
  SignedPartDto,
  VideoStatusDto,
  OwnerVideoStatusDto,
  PublicVideoDto,
} from './dto/video-responses.dto';
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { VideosService } from './videos.service';
import { StartUploadDto } from './dto/start-upload.dto';
import { SignPartsDto } from './dto/sign-parts.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

function ApiVideoErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: (
          {
            400: 'Invalid request or UUID',
            401: 'Missing or invalid access token',
            404: 'Video or owner channel not found',
            409: 'Video state does not allow this operation',
            422: 'Upload bytes or parts do not match the declared contract',
          } as Record<number, string>
        )[status],
        schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
      }),
    ),
  );
}

@ApiTags('videos')
@ApiExtraModels(ApiErrorEnvelope)
@ApiResponse({
  status: 429,
  description: 'Request rate limit exceeded',
  schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
})
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @ApiCreatedResponse({ type: UploadSessionDto })
  @Post('uploads')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create an upload draft',
    description:
      'Persists an owner draft and returns its multipart contract before any bytes are uploaded.',
  })
  @ApiVideoErrors(400, 401, 404, 422)
  start(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartUploadDto,
  ): Promise<UploadSessionDto> {
    return this.videos.start(user.sub, dto);
  }
  @ApiOkResponse({ type: SignedPartDto, isArray: true })
  @Post(':id/upload-parts')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign upload parts',
    description:
      'Returns short-lived MinIO URLs for the requested part numbers of an owned draft.',
  })
  @ApiVideoErrors(400, 401, 404, 409, 422)
  sign(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignPartsDto,
  ): Promise<SignedPartDto[]> {
    return this.videos.sign(user.sub, id, dto.partNumbers);
  }
  @ApiAcceptedResponse({ type: VideoStatusDto })
  @Post(':id/complete')
  @HttpCode(202)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Complete an upload',
    description:
      'Verifies uploaded parts and stored size, then persists processing state for the queue dispatcher. Repeated calls are idempotent.',
  })
  @ApiVideoErrors(400, 401, 404, 409, 422)
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<VideoStatusDto> {
    return this.videos.complete(user.sub, id, dto);
  }
  @ApiNoContentResponse()
  @Delete(':id/upload')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cancel a draft',
    description:
      'Aborts its multipart upload, removes any source object and deletes the owned draft.',
  })
  @ApiVideoErrors(400, 401, 404, 409)
  abort(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.videos.abort(user.sub, id);
  }
  @ApiOkResponse({ type: OwnerVideoStatusDto })
  @Get(':id/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Read processing status',
    description:
      'Returns the state and a stable failure code to the video owner.',
  })
  @ApiVideoErrors(400, 401, 404)
  status(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OwnerVideoStatusDto> {
    return this.videos.status(user.sub, id);
  }
  @Public()
  @ApiOkResponse({ type: PublicVideoDto })
  @Get(':slug')
  @ApiOperation({
    summary: 'Read published video metadata',
    description:
      'Returns duration, dimensions and public media links only after processing succeeds.',
  })
  @ApiVideoErrors(400, 404)
  metadata(
    @Param('slug', ParseUUIDPipe) slug: string,
  ): Promise<PublicVideoDto> {
    return this.videos.metadata(slug);
  }
  @Public()
  @ApiResponse({
    status: 307,
    description: 'Redirect to private storage; stream supports Range requests',
  })
  @Get(':slug/stream')
  @ApiOperation({
    summary: 'Stream a published video',
    description:
      'Redirects to a short-lived MP4 URL. Range requests are served directly by storage.',
  })
  @ApiVideoErrors(400, 404, 409)
  async stream(
    @Param('slug', ParseUUIDPipe) slug: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(307, await this.videos.media(slug, 'stream'));
  }
  @Public()
  @ApiResponse({
    status: 307,
    description: 'Redirect to private storage; stream supports Range requests',
  })
  @Get(':slug/download')
  @ApiOperation({
    summary: 'Download the original video',
    description:
      'Redirects to a short-lived URL with attachment disposition and the original filename.',
  })
  @ApiVideoErrors(400, 404, 409)
  async download(
    @Param('slug', ParseUUIDPipe) slug: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(307, await this.videos.media(slug, 'download'));
  }
  @Public()
  @ApiResponse({
    status: 307,
    description: 'Redirect to private storage; stream supports Range requests',
  })
  @Get(':slug/thumbnail')
  @ApiOperation({
    summary: 'Read the generated thumbnail',
    description: 'Redirects to the JPEG image created by the video worker.',
  })
  @ApiVideoErrors(400, 404, 409)
  async thumbnail(
    @Param('slug', ParseUUIDPipe) slug: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(307, await this.videos.media(slug, 'thumbnail'));
  }
}
