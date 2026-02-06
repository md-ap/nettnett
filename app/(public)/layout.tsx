import PublicNavbar from "@/components/PublicNavbar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  );
}
