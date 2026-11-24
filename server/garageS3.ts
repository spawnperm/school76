import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { GarageObjectMeta } from '../src/types/cubesat.ts';

const S3_ROOT = path.resolve(process.cwd(), 'data', 'garage-s3');

function safeBucket(bucket: string): string {
  const clean = bucket.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  if (!clean) throw new Error('Invalid S3 bucket');
  return clean;
}

function safeKey(key: string): string {
  const clean = key.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!clean || clean.includes('..')) throw new Error('Invalid S3 object key');
  return clean;
}

function getExternalS3Client(): S3Client | null {
  const endpoint = process.env.GARAGE_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.GARAGE_S3_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.GARAGE_S3_SECRET_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    endpoint,
    region: process.env.GARAGE_S3_REGION?.trim() || 'garage',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function resolveBucketDir(bucket: string): string {
  const cleanBucket = safeBucket(bucket);
  const dir = path.resolve(S3_ROOT, cleanBucket);
  if (!dir.startsWith(S3_ROOT + path.sep)) {
    throw new Error('Bucket path out of bounds');
  }
  return dir;
}

function readMetaMap(bucketDir: string): Record<string, GarageObjectMeta> {
  const metaPath = path.join(bucketDir, '_meta.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, GarageObjectMeta>;
    }
  } catch {
    // ignore corrupt meta
  }
  return {};
}

function writeMetaMap(bucketDir: string, meta: Record<string, GarageObjectMeta>) {
  const metaPath = path.join(bucketDir, '_meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

export function ensureGarageBucket(bucket: string) {
  const cleanBucket = safeBucket(bucket);
  const bucketDir = resolveBucketDir(cleanBucket);
  if (!fs.existsSync(bucketDir)) {
    fs.mkdirSync(bucketDir, { recursive: true });
  }

  // Seed initial 1U CubeSat cutaway image into default school76-media bucket if present
  if (cleanBucket === 'school76-media') {
    const key = 'cubesat-1u-cutaway.jpg';
    const dest = path.join(bucketDir, key);
    const seedSrc = path.resolve(
      process.cwd(),
      'src',
      'assets',
      'images',
      'cubesat_1u_isometric_1795541227873.jpg'
    );
    if (!fs.existsSync(dest) && fs.existsSync(seedSrc)) {
      const buf = fs.readFileSync(seedSrc);
      fs.writeFileSync(dest, buf);
      const etag = crypto.createHash('md5').update(buf).digest('hex');
      const meta = readMetaMap(bucketDir);
      meta[key] = {
        key,
        bucket: cleanBucket,
        size: buf.length,
        contentType: 'image/jpeg',
        etag,
        uploadedBy: 'Артём Соколов',
        uploadedAt: new Date().toISOString(),
        url: `/api/s3/${cleanBucket}/${key}`,
      };
      writeMetaMap(bucketDir, meta);
    }
  }
}

export async function listGarageObjects(bucket: string): Promise<GarageObjectMeta[]> {
  const cleanBucket = safeBucket(bucket);
  ensureGarageBucket(cleanBucket);

  const client = getExternalS3Client();
  if (client) {
    try {
      const res = await client.send(new ListObjectsV2Command({ Bucket: cleanBucket }));
      return (res.Contents || []).map((obj) => ({
        key: obj.Key || 'unknown',
        bucket: cleanBucket,
        size: obj.Size || 0,
        contentType: 'application/octet-stream',
        etag: (obj.ETag || '').replace(/"/g, ''),
        uploadedBy: 'Garage S3',
        uploadedAt: (obj.LastModified || new Date()).toISOString(),
        url: `/api/s3/${cleanBucket}/${encodeURIComponent(obj.Key || '')}`,
      }));
    } catch {
      // Fall back to embedded local Garage S3 store
    }
  }

  const bucketDir = resolveBucketDir(cleanBucket);
  const meta = readMetaMap(bucketDir);
  return Object.values(meta).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function putGarageObject(
  bucket: string,
  key: string,
  buffer: Buffer,
  contentType: string,
  uploadedBy: string
): Promise<GarageObjectMeta> {
  const cleanBucket = safeBucket(bucket);
  const cleanKey = safeKey(key);
  ensureGarageBucket(cleanBucket);

  const client = getExternalS3Client();
  if (client) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: cleanBucket,
          Key: cleanKey,
          Body: buffer,
          ContentType: contentType,
        })
      );
    } catch (err) {
      console.warn('External Garage S3 upload failed, falling back to embedded store:', err);
    }
  }

  const bucketDir = resolveBucketDir(cleanBucket);
  const filePath = path.resolve(bucketDir, cleanKey);
  if (!filePath.startsWith(bucketDir + path.sep)) {
    throw new Error('Path traversal blocked');
  }

  fs.writeFileSync(filePath, buffer);
  const etag = crypto.createHash('md5').update(buffer).digest('hex');
  const record: GarageObjectMeta = {
    key: cleanKey,
    bucket: cleanBucket,
    size: buffer.length,
    contentType: contentType || 'application/octet-stream',
    etag,
    uploadedBy: uploadedBy || 'Инженер school76',
    uploadedAt: new Date().toISOString(),
    url: `/api/s3/${cleanBucket}/${encodeURIComponent(cleanKey)}`,
  };
  const meta = readMetaMap(bucketDir);
  meta[cleanKey] = record;
  writeMetaMap(bucketDir, meta);
  return record;
}

export async function getGarageObject(
  bucket: string,
  key: string
): Promise<{ buffer: Buffer; contentType: string; etag: string } | null> {
  const cleanBucket = safeBucket(bucket);
  const cleanKey = safeKey(key);
  ensureGarageBucket(cleanBucket);

  const client = getExternalS3Client();
  if (client) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: cleanBucket, Key: cleanKey }));
      if (res.Body) {
        const bytes = await res.Body.transformToByteArray();
        return {
          buffer: Buffer.from(bytes),
          contentType: res.ContentType || 'application/octet-stream',
          etag: (res.ETag || '').replace(/"/g, ''),
        };
      }
    } catch {
      // check embedded store
    }
  }

  const bucketDir = resolveBucketDir(cleanBucket);
  const filePath = path.resolve(bucketDir, cleanKey);
  if (!filePath.startsWith(bucketDir + path.sep) || !fs.existsSync(filePath)) {
    return null;
  }
  const meta = readMetaMap(bucketDir);
  const info = meta[cleanKey];
  return {
    buffer: fs.readFileSync(filePath),
    contentType: info?.contentType || 'application/octet-stream',
    etag: info?.etag || '',
  };
}

export async function deleteGarageObject(bucket: string, key: string): Promise<boolean> {
  const cleanBucket = safeBucket(bucket);
  const cleanKey = safeKey(key);
  const bucketDir = resolveBucketDir(cleanBucket);
  const filePath = path.resolve(bucketDir, cleanKey);
  if (!filePath.startsWith(bucketDir + path.sep)) return false;

  const client = getExternalS3Client();
  if (client) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: cleanBucket, Key: cleanKey }));
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const meta = readMetaMap(bucketDir);
  if (meta[cleanKey]) {
    delete meta[cleanKey];
    writeMetaMap(bucketDir, meta);
    return true;
  }
  return false;
}
