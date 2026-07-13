import type { Metadata, Viewport } from "next";
import "./globals.css";
import RadioProvider from "@/components/RadioProvider";
import FloatingPlayer from "@/components/FloatingPlayer";

export const metadata: Metadata = {
  title: "NettNett",
  description: "NettNett Radio — independent radio streaming and community archive",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <RadioProvider>
          {children}
          <FloatingPlayer />
        </RadioProvider>
      </body>
    </html>
  );
}
