import { NextRequest, NextResponse } from "next/server";
import { getUserFolder, saveMetadata } from "@/lib/b2";
import { getSession } from "@/lib/auth";
import { sanitizeIdentifier } from "@/lib/internet-archive";
import pool from "@/lib/db";

function triggerNasSync() {
  const webhookUrl = process.env.NAS_WEBHOOK_URL;
  const webhookSecret = process.env.NAS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  fetch(webhookUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    console.error("NAS sync webhook failed:", err.message);
  });
}

function triggerNasIaUpload(data: {
  userFolder: string;
  titleFolder: string;
  iaIdentifier: string;
}) {
  const webhookUrl = process.env.NAS_WEBHOOK_URL;
  const webhookSecret = process.env.NAS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  // Replace /sync with /ia-upload in the webhook URL
  const iaWebhookUrl = webhookUrl.replace("/sync", "/ia-upload");

  fetch(iaWebhookUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${webhookSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    console.error("NAS IA upload webhook failed:", err.message);
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      title,
      titleFolder,
      description,
      mediatype,
      creator,
      date,
      subject: subjectRaw,
      language,
      uploadToIA,
      uploadedFiles,
    } = await request.json();

    if (!title || !titleFolder || !description || !mediatype || !uploadedFiles?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const userFolder = getUserFolder(session.firstName, session.lastName);

    const subjects = subjectRaw
      ? subjectRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    // Generate IA identifier and URL if uploading to IA
    let iaIdentifier: string | null = null;
    let iaUrl: string | null = null;

    if (uploadToIA) {
      iaIdentifier = sanitizeIdentifier(title, userFolder);
      iaUrl = `https://archive.org/details/${iaIdentifier}`;
    }

    // Save metadata.json to B2
    const metadata = {
      title,
      description,
      mediatype,
      creator: creator || null,
      date: date || null,
      subject: subjects,
      language: language || null,
      iaIdentifier,
      iaUrl,
      uploadedFiles,
      createdAt: new Date().toISOString(),
    };

    await saveMetadata(userFolder, titleFolder, metadata);

    // Store in database for search/editing
    try {
      await pool.query(
        `INSERT INTO public.items (user_id, folder, title, description, mediatype, creator, date, subject, language, ia_identifier, ia_url, created_at)
         VALUES ((SELECT id FROM public.users WHERE email = $1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (user_id, folder) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           mediatype = EXCLUDED.mediatype,
           creator = EXCLUDED.creator,
           date = EXCLUDED.date,
           subject = EXCLUDED.subject,
           language = EXCLUDED.language,
           ia_identifier = EXCLUDED.ia_identifier,
           ia_url = EXCLUDED.ia_url,
           updated_at = NOW()`,
        [
          session.email,
          titleFolder,
          title,
          description,
          mediatype,
          creator || null,
          date || null,
          JSON.stringify(subjects),
          language || null,
          iaIdentifier,
          iaUrl,
        ]
      );
    } catch (dbErr) {
      // DB insert is secondary — don't fail the upload if DB has issues
      console.error("Failed to insert item into DB:", dbErr);
    }

    // Trigger NAS rclone sync (fire-and-forget)
    triggerNasSync();

    // If uploading to IA, trigger NAS IA upload webhook (fire-and-forget)
    // Small delay to let rclone sync start first
    if (uploadToIA && iaIdentifier) {
      setTimeout(() => {
        triggerNasIaUpload({ userFolder, titleFolder, iaIdentifier: iaIdentifier! });
      }, 3000);
    }

    return NextResponse.json({
      success: true,
      folder: titleFolder,
      iaUrl,
      filesCount: uploadedFiles.length,
    });
  } catch (error) {
    console.error("Finalize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize upload" },
      { status: 500 }
    );
  }
}
