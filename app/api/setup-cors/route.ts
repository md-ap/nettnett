import { NextResponse } from "next/server";
import { configureBucketCors } from "@/lib/b2";

// One-time setup: Configure CORS on B2 bucket for presigned URL uploads
// Visit GET /api/setup-cors once after deploying
export async function GET() {
  try {
    await configureBucketCors([
      "https://nettnett.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ]);

    return NextResponse.json({
      success: true,
      message: "CORS configured on B2 bucket. Browser uploads are now enabled.",
    });
  } catch (error) {
    console.error("CORS setup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to configure CORS" },
      { status: 500 }
    );
  }
}
