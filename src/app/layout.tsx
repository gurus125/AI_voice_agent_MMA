import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Agent Dashboard",
  description: "Gemini Live voice agent with usage and estimated cost tracking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-navy-900 antialiased">{children}</body>
    </html>
  );
}
