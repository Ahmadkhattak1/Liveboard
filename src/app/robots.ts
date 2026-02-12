import type { MetadataRoute } from 'next';

function resolveSiteOrigin(): string | undefined {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!candidate) {
    return undefined;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return undefined;
  }
}

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = resolveSiteOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    ...(siteOrigin
      ? {
          host: siteOrigin,
          sitemap: `${siteOrigin}/sitemap.xml`,
        }
      : {}),
  };
}
