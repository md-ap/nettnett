import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserFolder, saveMetadata, s3Client, BUCKET_NAME } from "@/lib/b2";
import { sanitizeIdentifier } from "@/lib/internet-archive";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  retries = 3
) {
  const timeouts = [10000, 15000, 20000];
  const delays = [0, 5000, 10000];

  for (let i = 0; i < retries; i++) {
    try {
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeouts[i]),
      });
      console.log(`${label}: succeeded on attempt ${i + 1}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label}: attempt ${i + 1}/${retries} failed: ${msg}`);
      if (i === retries - 1) {
        console.error(`${label}: all ${retries} attempts failed`);
      }
    }
  }
}

async function triggerNasIaUpload(data: {
  userFolder: string;
  titleFolder: string;
  iaIdentifier: string;
}): Promise<void> {
  const webhookUrl = process.env.NAS_WEBHOOK_URL;
  const webhookSecret = process.env.NAS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  const iaWebhookUrl = webhookUrl.endsWith("/sync")
    ? webhookUrl.slice(0, -5) + "/ia-upload"
    : webhookUrl + "/ia-upload";

  await fetchWithRetry(
    iaWebhookUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
    "NAS IA upload webhook"
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { folder } = await request.json();

    if (!folder) {
      return NextResponse.json(
        { error: "Folder is required" },
        { status: 400 }
      );
    }

    const userFolder = getUserFolder(session.firstName, session.lastName);

    // 1. Read existing metadata.json from B2
    let existingMetadata: Record<string, unknown> = {};
    try {
      const metaResult = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${userFolder}/${folder}/metadata.json`,
        })
      );
      const metaStr = await metaResult.Body?.transformToString();
      if (metaStr) existingMetadata = JSON.parse(metaStr);
    } catch {
      return NextResponse.json(
        { error: "Item metadata not found" },
        { status: 404 }
      );
    }

    // 2. Guard: already on IA
    if (existingMetadata.iaIdentifier) {
      return NextResponse.json(
        { error: "Item is already on Internet Archive" },
        { status: 400 }
      );
    }

    // 3. Guard: must have a title
    const title = existingMetadata.title as string;
    if (!title) {
      return NextResponse.json(
        { error: "Item has no title in metadata" },
        { status: 400 }
      );
    }

    // 4. Generate IA identifier and URL
    const iaIdentifier = sanitizeIdentifier(title, userFolder);
    const iaUrl = `https://archive.org/details/${iaIdentifier}`;

    // 5. Update metadata.json in B2 with IA fields
    const updatedMetadata = {
      ...existingMetadata,
      iaIdentifier,
      iaUrl,
    };
    await saveMetadata(userFolder, folder, updatedMetadata);

    // 6. Update DB record
    try {
      await pool.query(
        `UPDATE public.items
         SET ia_identifier = $1, ia_url = $2, updated_at = NOW()
         WHERE user_id = (SELECT id FROM public.users WHERE email = $3) AND folder = $4`,
        [iaIdentifier, iaUrl, session.email, folder]
      );
    } catch (dbErr) {
      console.error("Failed to update IA fields in DB:", dbErr);
    }

    // 7. Trigger NAS IA upload webhook (NAS syncs files from B2 then uploads to IA)
    console.log(`Send to IA: triggering NAS upload for ${iaIdentifier}`);
    await triggerNasIaUpload({ userFolder, titleFolder: folder, iaIdentifier });

    return NextResponse.json({
      success: true,
      iaIdentifier,
      iaUrl,
    });
  } catch (error) {
    console.error("Send to IA error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send to Internet Archive",
      },
      { status: 500 }
    );
  }
}
