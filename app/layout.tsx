import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tensorium Pool",
  description: "Official Tensorium mining pool stats, payout history, and connection guide"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
