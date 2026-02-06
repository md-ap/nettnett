import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listUserItems } from "@/lib/b2";
import UploadForm from "@/components/UploadForm";
import ItemList from "@/components/ItemList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const items = await listUserItems(session.firstName, session.lastName);

  return (
    <div className="space-y-8">
      <UploadForm />
      <ItemList items={items} />
    </div>
  );
}
