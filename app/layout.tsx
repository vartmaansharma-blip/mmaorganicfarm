import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

const siteUrl = "https://mmaorganicfarm-tvn8.vercel.app";
const siteTitle = "M'ma Organic Farm | Fresh Farm Milk Delivery in Jamshedpur";
const siteDescription =
  "Order fresh farm milk in Jamshedpur from M'ma Organic Farm. ₹62 per litre, glass bottle delivery, 20 years operating, 500+ families served, and 1,000 L+ daily production.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | M'ma Organic Farm",
  },
  description: siteDescription,
  keywords: [
    "fresh milk delivery Jamshedpur",
    "farm fresh milk Jamshedpur",
    "M'ma Organic Farm",
    "Mma Organic Farm",
    "glass bottle milk Jamshedpur",
    "milk home delivery Jamshedpur",
    "fresh farm dairy Jamshedpur",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "M'ma Organic Farm",
    images: [
      {
        url: "/hero-milk.png",
        alt: "M'ma Organic Farm fresh milk bottle",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/hero-milk.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html className={inter.variable} data-scroll-behavior="smooth" lang="en">
      <body>{children}</body>
    </html>
  );
}
