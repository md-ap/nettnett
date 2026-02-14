import { S3Client, PutObjectCommand, PutBucketCorsCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: true,
});

export const BUCKET_NAME = process.env.B2_BUCKET_NAME!;

export function getUserFolder(firstName: string, lastName: string): string {
  const clean = (s: string) =>
    s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  return `user_${clean(firstName)}_${clean(lastName)}`;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 1800
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function configureBucketCors(allowedOrigins: string[]) {
  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
}

export async function createUserFolder(firstName: string, lastName: string) {
  const folder = getUserFolder(firstName, lastName);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${folder}/`,
      Body: Buffer.alloc(0),
      ContentType: "application/x-directory",
    })
  );
  return folder;
}

export interface UploadItem {
  title: string;
  folder: string;
  iaIdentifier: string | null;
  iaUrl: string | null;
  files: UploadItemFile[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UploadItemFile {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
}

export async function listUserItems(firstName: string, lastName: string): Promise<UploadItem[]> {
  const userFolder = getUserFolder(firstName, lastName);
  const result = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${userFolder}/`,
    })
  );

  if (!result.Contents) return [];

  // Group files by title subfolder
  const itemsMap = new Map<string, { files: UploadItemFile[]; metadata: Record<string, unknown> | null }>();

  for (const obj of result.Contents) {
    if (!obj.Key || obj.Key === `${userFolder}/`) continue;

    const relativePath = obj.Key.replace(`${userFolder}/`, "");
    const parts = relativePath.split("/");

    // Must have at least titleFolder/filename
    if (parts.length < 2) continue;

    const titleFolder = parts[0];
    const fileName = parts.slice(1).join("/");

    if (!fileName || obj.Size === 0) continue;

    if (!itemsMap.has(titleFolder)) {
      itemsMap.set(titleFolder, { files: [], metadata: null });
    }

    const item = itemsMap.get(titleFolder)!;

    if (fileName === "metadata.json") {
      // We'll fetch metadata separately
      continue;
    }

    item.files.push({
      key: obj.Key,
      name: fileName,
      size: obj.Size!,
      lastModified: obj.LastModified!,
    });
  }

  // Fetch metadata.json for each item
  const items: UploadItem[] = [];
  for (const [titleFolder, data] of itemsMap) {
    if (data.files.length === 0) continue;

    let metadata: Record<string, unknown> = {};
    try {
      const metaResult = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${userFolder}/${titleFolder}/metadata.json`,
        })
      );
      const metaStr = await metaResult.Body?.transformToString();
      if (metaStr) metadata = JSON.parse(metaStr);
    } catch {
      // No metadata.json, use defaults
    }

    items.push({
      title: (metadata.title as string) || titleFolder,
      folder: titleFolder,
      iaIdentifier: (metadata.iaIdentifier as string) || null,
      iaUrl: (metadata.iaUrl as string) || null,
      files: data.files,
      metadata,
      createdAt: (metadata.createdAt as string) || data.files[0]?.lastModified?.toISOString() || "",
    });
  }

  // Sort by newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return items;
}

export async function saveMetadata(
  userFolder: string,
  titleFolder: string,
  metadata: Record<string, unknown>
) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${userFolder}/${titleFolder}/metadata.json`,
      Body: Buffer.from(JSON.stringify(metadata, null, 2)),
      ContentType: "application/json",
    })
  );
}

export async function deleteFile(fileKey: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
    })
  );
}

export async function deleteItem(userFolder: string, titleFolder: string) {
  // List all files in the item folder
  const result = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${userFolder}/${titleFolder}/`,
    })
  );

  if (result.Contents) {
    for (const obj of result.Contents) {
      if (obj.Key) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key,
          })
        );
      }
    }
  }
}
