import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { StoredPart, UploadedPart } from './upload-policy';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly bucket = process.env.S3_BUCKET ?? 'videos';
  private readonly options = {
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'streamtube',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'streamtube-local-only',
    },
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  };
  private readonly internal = new S3Client({
    ...this.options,
    endpoint: process.env.S3_ENDPOINT ?? 'http://storage:9000',
  });
  private readonly publicClient = new S3Client({
    ...this.options,
    endpoint: process.env.S3_PUBLIC_ENDPOINT ?? 'http://storage:9000',
  });
  onModuleDestroy(): void {
    this.internal.destroy();
    this.publicClient.destroy();
  }
  async initiate(key: string, contentType: string): Promise<string> {
    const result = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId)
      throw new Error('Storage did not return an upload id');
    return result.UploadId;
  }
  async signPart(
    key: string,
    uploadId: string,
    partNumber: number,
    size: number,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: size,
      }),
      { expiresIn: 900 },
    );
  }
  async parts(key: string, uploadId: string): Promise<StoredPart[]> {
    const result: StoredPart[] = [];
    let marker: string | undefined;
    do {
      const response = await this.internal.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of response.Parts ?? [])
        result.push({
          partNumber: part.PartNumber ?? 0,
          etag: part.ETag ?? '',
          size: part.Size ?? 0,
        });
      marker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
    } while (marker);
    return result;
  }
  async head(key: string): Promise<number | null> {
    try {
      return (
        (
          await this.internal.send(
            new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
          )
        ).ContentLength ?? null
      );
    } catch (error) {
      if (
        error instanceof Error &&
        ['NotFound', 'NoSuchKey'].includes(error.name)
      )
        return null;
      throw error;
    }
  }
  async complete(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }
  async abort(key: string, uploadId: string): Promise<void> {
    try {
      await this.internal.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchUpload') return;
      throw error;
    }
  }
  async remove(key: string): Promise<void> {
    await this.internal.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
  async url(key: string, filename?: string): Promise<string> {
    const disposition = filename
      ? `attachment; filename="video"; filename*=UTF-8''${encodeURIComponent(filename)}`
      : undefined;
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: 900 },
    );
  }
  async download(key: string, path: string): Promise<void> {
    const result = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!(result.Body instanceof Readable))
      throw new Error('Expected a streaming response');
    await pipeline(result.Body, createWriteStream(path, { flags: 'wx' }));
  }
  async putFile(key: string, path: string, contentType: string): Promise<void> {
    const size = (await stat(path)).size;
    // Outputs are constrained by input bitrate/resolution but S3 PutObject caps at 5GB.
    // Multipart output preserves large recordings without buffering the file.
    const uploadId = await this.initiate(key, contentType);
    const parts: UploadedPart[] = [];
    const chunk = 64 * 1024 * 1024;
    try {
      for (let start = 0, number = 1; start < size; start += chunk, number++) {
        const end = Math.min(start + chunk, size) - 1;
        const result = await this.internal.send(
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: number,
            ContentLength: end - start + 1,
            Body: createReadStream(path, { start, end }),
          }),
        );
        if (!result.ETag) throw new Error('Storage omitted ETag');
        parts.push({ partNumber: number, etag: result.ETag });
      }
      await this.complete(key, uploadId, parts);
    } catch (error) {
      await this.abort(key, uploadId);
      throw error;
    }
  }
}
