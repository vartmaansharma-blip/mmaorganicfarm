import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import {ShopProvider} from "./shop/shop-state";
import {nextDeliveryDateInIndia} from "@/lib/delivery-calendar";

const editorial = localFont({
  src: "../public/fonts/Fraunces-Variable.woff2",
  display: "swap",
  variable: "--font-fraunces",
  weight: "100 900",
});
const interfaceFont = localFont({
  src: "../public/fonts/SpaceGrotesk-Variable.woff2",
  display: "swap",
  variable: "--font-space-grotesk",
  weight: "300 700",
});

const siteUrl = "https://mmaorganicfarm.vercel.app";
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
        url: "/og-milk.jpg",
        width: 1200,
        height: 630,
        alt: "M'ma Organic Farm — fresh milk delivered in glass in Jamshedpur",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-milk.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${editorial.variable} ${interfaceFont.variable}`} data-theme="dark" data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <head>
        <script id="mama-theme" dangerouslySetInnerHTML={{ __html: `(function(){var t='dark';try{if(localStorage.getItem('mama-theme')==='light')t='light'}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})()` }} />
      </head>
      <body><ShopProvider minimumDate={nextDeliveryDateInIndia()}>{children}</ShopProvider></body>
    </html>
  );
}
