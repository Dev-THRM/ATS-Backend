import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
  publicUrl?: string;
}

export interface UploadBufferParams {
  key: string;
  buffer: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;
  private readonly publicUrl?: string;
  private readonly backendUrl?: string;
  private readonly isR2Enabled: boolean;
  private readonly localStorageDir: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucketName = this.config.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL');
    this.backendUrl = (this.config.get<string>('BACKEND_URL') || '').trim().replace(/\/+$/, '');

    this.localStorageDir = path.resolve(process.cwd(), 'storage');

    if (accountId && accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isR2Enabled = true;
      this.logger.log(`Cloudflare R2 storage initialized (Bucket: ${this.bucketName})`);
    } else {
      this.isR2Enabled = false;
      this.logger.log(
        'R2 credentials not provided. Operating in Local-Safe storage mode.',
      );
    }
  }

  isR2Active(): boolean {
    return this.isR2Enabled;
  }

  private getLocalUrl(key: string): string {
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return this.backendUrl ? `${this.backendUrl}/storage/${cleanKey}` : `/storage/${cleanKey}`;
  }

  /**
   * Generates a pre-signed PUT upload URL for direct browser uploads.
   */
  async generatePresignedUploadUrl(
    key: string,
    contentType: string = 'application/pdf',
    expiresInSeconds: number = 3600,
  ): Promise<PresignedUploadResult> {
    if (this.isR2Enabled && this.s3Client && this.bucketName) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      const publicUrl = this.publicUrl
        ? `${this.publicUrl.replace(/\/$/, '')}/${key}`
        : uploadUrl.split('?')[0];

      return {
        uploadUrl,
        key,
        expiresInSeconds,
        publicUrl,
      };
    }

    // Local / Dev Fallback: return mock presigned upload URL
    const localUrl = `/api/v1/ats/resumes/local-upload?key=${encodeURIComponent(key)}`;
    return {
      uploadUrl: localUrl,
      key,
      expiresInSeconds,
      publicUrl: this.getLocalUrl(key),
    };
  }

  /**
   * Generates a pre-signed GET URL for secure, temporary document access.
   */
  async generatePresignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    if (this.isR2Enabled && this.s3Client && this.bucketName) {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    }

    // Local dev mode fallback
    return this.getLocalUrl(key);
  }

  /**
   * Uploads a Buffer directly to storage.
   */
  async uploadBuffer(params: UploadBufferParams): Promise<{ key: string; url: string }> {
    if (this.isR2Enabled && this.s3Client && this.bucketName) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.contentType || 'application/octet-stream',
          Metadata: params.metadata,
        }),
      );

      const url = this.publicUrl
        ? `${this.publicUrl.replace(/\/$/, '')}/${params.key}`
        : `https://${this.bucketName}.r2.cloudflarestorage.com/${params.key}`;

      return { key: params.key, url };
    }

    // Local fallback: save to local disk
    const targetPath = path.join(this.localStorageDir, params.key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, params.buffer);

    return {
      key: params.key,
      url: this.getLocalUrl(params.key),
    };
  }

  /**
   * Retrieves a file Buffer from storage (for background resume parsing).
   */
  async getFileBuffer(key: string): Promise<Buffer> {
    if (this.isR2Enabled && this.s3Client && this.bucketName) {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      const streamToBuffer = async (stream: any): Promise<Buffer> => {
        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      };

      return streamToBuffer(response.Body);
    }

    // Local fallback: read from disk
    let cleanKey = key;
    if (cleanKey.includes('resumes/')) {
      cleanKey = 'resumes/' + cleanKey.split('resumes/')[1].split('?')[0];
    } else {
      cleanKey = cleanKey
        .replace(/^https?:\/\/[^/]+\//, '')
        .replace(/^\/?storage\//, '')
        .replace(/^\\?storage\\/, '')
        .replace(/^[/\\]+/, '')
        .split('?')[0];
    }
    const targetPath = path.join(this.localStorageDir, cleanKey);
    return fs.readFile(targetPath);
  }

  /**
   * Deletes a file from storage.
   */
  async deleteFile(key: string): Promise<void> {
    if (this.isR2Enabled && this.s3Client && this.bucketName) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return;
    }

    // Local fallback: remove from disk
    const targetPath = path.join(this.localStorageDir, key);
    try {
      await fs.unlink(targetPath);
    } catch {
      // Ignore if file already deleted
    }
  }
}
