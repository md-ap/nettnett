import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserFolder, saveMetadata } from "@/lib/b2";
import { s3Client, BUCKET_NAME } from "@/lib/b2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import pool from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { folder, title, description, mediatype, creator, date, subject, language } = body;

    if (!folder || !title || !description) {
      return NextResponse.json(
        { error: "Folder, title, and description are required" },
        { status: 400 }
      );
    }

    const userFolder = getUserFolder(session.firstName, session.lastName);

    // Read existing metadata.json from B2 to preserve fields we don't edit
    // (iaIdentifier, iaUrl, uploadedFiles, createdAt)
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
      // No existing metadata — this is unusual but we'll proceed
    }

    const subjects = subject
      ? (typeof subject === "string" ? subject.split(",").map((s: string) => s.trim()).filter(Boolean) : subject)
      : [];

    // Merge: update editable fields, preserve non-editable ones
    const updatedMetadata = {
      ...existingMetadata,
      title,
      description,
      mediatype: mediatype || existingMetadata.mediatype,
      creator: creator || null,
      date: date || null,
      subject: subjects,
      language: language || null,
      // These stay the same — not editable
      iaIdentifier: existingMetadata.iaIdentifier || null,
      iaUrl: existingMetadata.iaUrl || null,
      uploadedFiles: existingMetadata.uploadedFiles || [],
      createdAt: existingMetadata.createdAt || new Date().toISOString(),
    };

    // Save updated metadata.json to B2
    await saveMetadata(userFolder, folder, updatedMetadata);

    // Update in database
    try {
      await pool.query(
        `UPDATE public.items
         SET title = $1, description = $2, mediatype = $3, creator = $4, date = $5,
             subject = $6, language = $7, updated_at = NOW()
         WHERE user_id = (SELECT id FROM public.users WHERE email = $8) AND folder = $9`,
        [
          title,
          description,
          mediatype || null,
          creator || null,
          date || null,
          JSON.stringify(subjects),
          language || null,
          session.email,
          folder,
        ]
      );
    } catch (dbErr) {
      console.error("Failed to update item in DB:", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 }
    );
  }
}
