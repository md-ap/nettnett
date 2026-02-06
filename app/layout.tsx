import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NettNett",
  description: "Secure file upload and management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
