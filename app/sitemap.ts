import type { MetadataRoute } from "next";

const siteUrl = "https://mmaorganicfarm.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/pricing",
    "/shop",
    "/shop/milk",
    "/shop/paneer",
    "/shop/ghee",
    "/shipping",
    "/contact",
    "/terms",
    "/privacy",
    "/cancellation-refunds",
  ].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date("2026-08-13"),
    changeFrequency: path === "" || path === "/pricing" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
