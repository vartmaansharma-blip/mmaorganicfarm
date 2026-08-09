import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/shipping", "/contact", "/terms", "/privacy", "/cancellation-refunds"],
      disallow: ["/account", "/calendar", "/farm", "/order"],
    },
    sitemap: "https://mmaorganicfarm-tvn8.vercel.app/sitemap.xml",
  };
}
