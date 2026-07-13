import { NextRequest, NextResponse } from "next/server";
import { requireRole, canUpload } from "@/lib/auth";
import { getPresignedUploadUrl } from "@/lib/b2";

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

    const userFolder = auth.b2Folder;
    const titleFolder = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const presignedUrls = await Promise.all(
      files.map(async (file: { name: string; type: string; size: number }) => {
        const key = `${userFolder}/${titleFolder}/${file.name}`;
        const uploadUrl = await getPresignedUploadUrl(
          key,
          file.type || "application/octet-stream"
        );
        return {
          fileName: file.name,
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
