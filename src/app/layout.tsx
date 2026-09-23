import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rakuun",
  description: "Capture contacts and send personalized outreach."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-coffee-white">{children}</body>
    </html>
  );
}
