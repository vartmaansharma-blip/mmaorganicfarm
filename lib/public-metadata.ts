/** Page-specific search and social details for the public, indexable pages. */
export function publicMetadata(path: string, title: string, description: string) {
  const socialTitle = `${title} | M'ma Organic Farm`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: "M'ma Organic Farm",
      images: [{ url: "/og-milk.jpg", width: 1200, height: 630, alt: "M'ma Organic Farm milk in Jamshedpur" }],
      locale: "en_IN",
      type: "website" as const,
    },
    twitter: { card: "summary_large_image" as const, title: socialTitle, description, images: ["/og-milk.jpg"] },
  };
}
