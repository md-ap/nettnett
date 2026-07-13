import { NextRequest, NextResponse } from "next/server";
import { saveMetadata, titleToFolder, sanitizeFileName } from "@/lib/b2";
import { requireRole, canUpload } from "@/lib/auth";
import { sanitizeIdentifier } from "@/lib/internet-archive";
import { triggerNasSync, triggerNasIaUpload } from "@/lib/nas-webhook";
import { logActivity, actorFromSession } from "@/lib/activity-log";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(canUpload, {
      forbiddenMessage: "Your account does not have upload permissions yet",
    });
    if (auth instanceof NextResponse) return auth;

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

    // Never trust the client folder: re-derive it from the title (the same
    // derivation presign used) so a crafted value can't point elsewhere.
    if (titleFolder !== titleToFolder(String(title))) {
      return NextResponse.json(
        { error: "titleFolder does not match title" },
        { status: 400 }
      );
    }

    const safeUploadedFiles = (uploadedFiles as { name?: unknown; size?: unknown }[])
      .slice(0, 25)
      .map((f) => ({
        name: sanitizeFileName(String(f?.name ?? "")),
        size: Number(f?.size) || 0,
      }));

    const userFolder = auth.b2Folder;

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
      uploadedFiles: safeUploadedFiles,
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
          auth.session.email,
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

    // Trigger NAS webhooks (await to ensure they execute before Vercel kills the runtime)
    const webhookPromises: Promise<void>[] = [triggerNasSync()];

    if (uploadToIA && iaIdentifier) {
      console.log(`Finalize: triggering IA upload for ${iaIdentifier}`);
      webhookPromises.push(
        triggerNasIaUpload({ userFolder, titleFolder, iaIdentifier: iaIdentifier! })
      );
    }

    // Wait for all webhooks to at least start (first attempt)
    await Promise.allSettled(webhookPromises);

    await logActivity(
      actorFromSession(auth.session),
      "file.upload",
      `Uploaded "${title}" (${safeUploadedFiles.length} file${safeUploadedFiles.length === 1 ? "" : "s"}${uploadToIA ? " + Internet Archive" : ""})`
    );

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
