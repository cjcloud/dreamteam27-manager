import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DreamTeam27 — Register Your Team",
  description: "Self-service team registration for DreamTeam27 managers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
