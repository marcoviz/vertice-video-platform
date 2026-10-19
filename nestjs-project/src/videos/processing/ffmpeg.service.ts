import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export interface VideoProbe {
  duration: number;
  width: number;
  height: number;
  codec: string;
}
@Injectable()
export class FfmpegService {
  async probe(path: string): Promise<VideoProbe> {
    const { stdout } = await execute(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height',
        '-of',
        'json',
        path,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const parsed: unknown = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object')
      throw new Error('Invalid media metadata');
    const data = parsed as {
      format?: { duration?: string };
      streams?: {
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }[];
    };
    const video = data.streams?.find((s) => s.codec_type === 'video');
    const duration = Number(data.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !video.width ||
      !video.height
    )
      throw new Error('No valid video stream');
    return {
      duration,
      width: video.width,
      height: video.height,
      codec: video.codec_name ?? 'unknown',
    };
  }
  async render(
    input: string,
    output: string,
    thumbnail: string,
  ): Promise<void> {
    await execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-i',
        input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        output,
      ],
      { timeout: 4 * 60 * 60 * 1000, maxBuffer: 1024 * 1024 },
    );
    await execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        output,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:-2',
        thumbnail,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
  }
}
