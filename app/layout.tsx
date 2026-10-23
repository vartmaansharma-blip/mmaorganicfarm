import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const editorial = localFont({
  src: "../public/fonts/Fraunces-Variable.ttf",
  display: "swap",
  variable: "--font-fraunces",
  weight: "100 900",
});
const interfaceFont = localFont({
  src: "../public/fonts/SpaceGrotesk-Variable.ttf",
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
    icon: [{ url: "/mma-logo.png", type: "image/png" }],
    shortcut: "/mma-logo.png",
    apple: "/mma-logo.png",
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
      <body>{children}</body>
    </html>
  );
}
