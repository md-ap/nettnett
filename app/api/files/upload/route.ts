import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME, getUserFolder, saveMetadata } from "@/lib/b2";
import { getSession } from "@/lib/auth";
import { uploadToInternetArchive, sanitizeIdentifier } from "@/lib/internet-archive";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const mediatype = formData.get("mediatype") as string;
    const creator = formData.get("creator") as string | null;
    const date = formData.get("date") as string | null;
    const subjectRaw = formData.get("subject") as string | null;
    const language = formData.get("language") as string | null;
    const uploadToIA = formData.get("uploadToIA") === "true";

    if (!title || !description || !mediatype || files.length === 0) {
      return NextResponse.json(
        { error: "Title, description, media type, and at least one file are required" },
        { status: 400 }
      );
    }

    const userFolder = getUserFolder(session.firstName, session.lastName);
    const titleFolder = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const subjects = subjectRaw
      ? subjectRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Upload files to Backblaze B2
    const uploadedFiles: { name: string; size: number }[] = [];
    for (const file of files) {
      const fileKey = `${userFolder}/${titleFolder}/${file.name}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          Body: buffer,
          ContentType: file.type || "application/octet-stream",
        })
      );

      uploadedFiles.push({ name: file.name, size: file.size });
    }

    // Upload to Internet Archive if checked
    let iaIdentifier: string | null = null;
    let iaUrl: string | null = null;

    if (uploadToIA) {
      iaIdentifier = sanitizeIdentifier(title, userFolder);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const result = await uploadToInternetArchive(
          iaIdentifier,
          file.name,
          buffer,
          {
            title,
            description,
            mediatype,
            creator: creator || undefined,
            date: date || undefined,
            subject: subjects.length > 0 ? subjects : undefined,
            language: language || undefined,
            collection: "opensource",
          },
          i === 0
        );

        if (i === 0) {
          iaUrl = result.itemUrl;
        }
      }
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

    return NextResponse.json({
      success: true,
      folder: titleFolder,
      iaUrl,
      filesCount: uploadedFiles.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload" },
      { status: 500 }
    );
  }
}
