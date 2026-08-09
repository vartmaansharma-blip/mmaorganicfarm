import type { MetadataRoute } from "next";

const siteUrl = "https://mmaorganicfarm-tvn8.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/pricing",
    "/shipping",
    "/contact",
    "/terms",
    "/privacy",
    "/cancellation-refunds",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date("2026-08-09"),
    changeFrequency: path === "" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
