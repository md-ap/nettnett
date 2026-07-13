import { NextRequest, NextResponse } from "next/server";
import { requireRole, canUpload } from "@/lib/auth";
import { saveMetadata, s3Client, BUCKET_NAME } from "@/lib/b2";
import { sanitizeIdentifier } from "@/lib/internet-archive";
import { triggerNasIaUpload } from "@/lib/nas-webhook";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(canUpload, {
      forbiddenMessage: "Your account does not have upload permissions yet",
    });
    if (auth instanceof NextResponse) return auth;

    const { folder } = await request.json();

    if (!folder) {
      return NextResponse.json(
        { error: "Folder is required" },
        { status: 400 }
      );
    }

    const userFolder = auth.b2Folder;

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
        [iaIdentifier, iaUrl, auth.session.email, folder]
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
