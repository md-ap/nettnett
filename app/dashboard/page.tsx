import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import UploadForm from "@/components/UploadForm";
import DashboardItems from "@/components/DashboardItems";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-8">
      <UploadForm />
      <DashboardItems />
    </div>
  );
}
