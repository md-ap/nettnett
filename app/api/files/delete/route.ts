import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserFolder, deleteItem } from "@/lib/b2";
import { deleteFromInternetArchive } from "@/lib/internet-archive";
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

async function triggerNasDelete(data: {
  userFolder: string;
  titleFolder: string;
}): Promise<void> {
  const webhookUrl = process.env.NAS_WEBHOOK_URL;
  const webhookSecret = process.env.NAS_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  const deleteUrl = webhookUrl.endsWith("/sync")
    ? webhookUrl.slice(0, -5) + "/delete-item"
    : webhookUrl + "/delete-item";

  await fetchWithRetry(
    deleteUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
    "NAS delete webhook"
  );
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { titleFolder, iaIdentifier, fileNames } = await request.json();

    if (!titleFolder) {
      return NextResponse.json(
        { error: "Title folder is required" },
        { status: 400 }
      );
    }

    const userFolder = getUserFolder(session.firstName, session.lastName);

    // Delete entire item folder from B2 (all files + metadata.json)
    await deleteItem(userFolder, titleFolder);

    // Delete item folder from NAS
    await triggerNasDelete({ userFolder, titleFolder });

    // If item was on Internet Archive, delete files from there too
    if (iaIdentifier && fileNames && fileNames.length > 0) {
      for (const fileName of fileNames) {
        try {
          await deleteFromInternetArchive(iaIdentifier, fileName);
        } catch (err) {
          console.error(`Failed to delete ${fileName} from IA:`, err);
        }
      }
    }

    // Delete from database
    try {
      await pool.query(
        `DELETE FROM public.items WHERE user_id = (SELECT id FROM public.users WHERE email = $1) AND folder = $2`,
        [session.email, titleFolder]
      );
    } catch (dbErr) {
      console.error("Failed to delete item from DB:", dbErr);
    }

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
