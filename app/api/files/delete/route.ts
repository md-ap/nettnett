import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserFolder, deleteItem } from "@/lib/b2";
import { deleteFromInternetArchive } from "@/lib/internet-archive";

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

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
