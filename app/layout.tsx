import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Composio Chat",
  description: "AI chat app with Composio tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
