import type { Metadata } from "next";
import { Providers } from "../components/providers";
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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
