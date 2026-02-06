import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listUserItems } from "@/lib/b2";
import UploadForm from "@/components/UploadForm";
import ItemList from "@/components/ItemList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let items: Awaited<ReturnType<typeof listUserItems>> = [];
  let b2Error = false;

  try {
    items = await listUserItems(session.firstName, session.lastName);
  } catch (error) {
    console.error("Failed to load items from B2:", error);
    b2Error = true;
  }

  return (
    <div className="space-y-8">
      <UploadForm />
      {b2Error ? (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <p className="text-yellow-400 font-medium">Cloud storage is temporarily unavailable</p>
          <p className="text-sm text-neutral-400 mt-2">
            Your files could not be loaded. This is usually temporary — try refreshing in a few minutes.
          </p>
        </div>
      ) : (
        <ItemList items={items} />
      )}
    </div>
  );
}
