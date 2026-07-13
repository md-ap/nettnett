import { NextRequest, NextResponse } from "next/server";
import { requireRole, canUpload } from "@/lib/auth";
import { getPresignedUploadUrl, titleToFolder, sanitizeFileName } from "@/lib/b2";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(canUpload, {
      forbiddenMessage: "Your account does not have upload permissions yet",
    });
    if (auth instanceof NextResponse) return auth;

    const { title, files } = await request.json();

    if (!title || !files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "Title and at least one file are required" },
        { status: 400 }
      );
    }
    if (typeof title !== "string" || title.length > 200) {
      return NextResponse.json(
        { error: "Title too long (max 200 characters)" },
        { status: 400 }
      );
    }
    if (files.length > 25) {
      return NextResponse.json(
        { error: "Too many files (max 25 per item)" },
        { status: 400 }
      );
    }

    const userFolder = auth.b2Folder;
    const titleFolder = titleToFolder(title);
    if (!titleFolder) {
      return NextResponse.json(
        { error: "Title must contain letters or numbers" },
        { status: 400 }
      );
    }

    const presignedUrls = await Promise.all(
      files.map(async (file: { name: string; type: string; size: number }) => {
        const safeName = sanitizeFileName(String(file.name ?? ""));
        const key = `${userFolder}/${titleFolder}/${safeName}`;
        const uploadUrl = await getPresignedUploadUrl(
          key,
          file.type || "application/octet-stream"
        );
        return {
          fileName: safeName,
          key,
          uploadUrl,
        };
      })
    );

    return NextResponse.json({
      userFolder,
      titleFolder,
      presignedUrls,
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate upload URLs" },
      { status: 500 }
    );
  }
}
