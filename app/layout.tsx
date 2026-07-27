import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M'ma Organic Farm | Fresh milk for Jamshedpur homes",
  description:
    "Fresh farm milk from M'ma Organic Farm, delivered to Jamshedpur homes in glass bottles.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
