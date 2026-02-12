import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

import { AuthProvider } from '@/components/providers/AuthProvider';

const siteName = 'Liveboard';
const siteTitle = 'Liveboard | Online Whiteboard for Teachers and Teams';
const siteDescription =
  'Liveboard is a real-time collaborative whiteboard for teachers and teams to brainstorm, teach lessons, map ideas, and share plans from anywhere.';
const brandColor = '#2b8de3';
const seoKeywords = [
  'collaborative whiteboard',
  'online whiteboard',
  'whiteboard for teachers',
  'virtual classroom whiteboard',
  'team brainstorming tool',
  'shared whiteboard',
  'real-time collaboration',
  'digital lesson planning',
  'remote team collaboration',
  'interactive whiteboard app',
];

function resolveSiteUrl(): URL | null {
  const candidate =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

const siteUrl = resolveSiteUrl();
const openGraphImageUrl = siteUrl
  ? new URL('/android-chrome-512x512.png', siteUrl).toString()
  : undefined;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: siteName,
  description: siteDescription,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  keywords: seoKeywords.join(', '),
  audience: [
    {
      '@type': 'Audience',
      audienceType: 'Teachers',
    },
    {
      '@type': 'Audience',
      audienceType: 'Teams',
    },
  ],
  featureList: [
    'Real-time shared whiteboards',
    'Collaborative lesson planning',
    'Team brainstorming canvas',
    'Shareable boards for remote collaboration',
  ],
  ...(siteUrl ? { url: siteUrl.toString() } : {}),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: brandColor,
};

export const metadata: Metadata = {
  metadataBase: siteUrl ?? undefined,
  applicationName: siteName,
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: seoKeywords,
  manifest: '/site.webmanifest',
  alternates: siteUrl
    ? {
        canonical: '/',
      }
    : undefined,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: 'en_US',
    ...(siteUrl ? { url: siteUrl.toString() } : {}),
    ...(openGraphImageUrl
      ? {
          images: [
            {
              url: openGraphImageUrl,
              width: 512,
              height: 512,
              alt: 'Liveboard whiteboard logo',
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: openGraphImageUrl ? 'summary_large_image' : 'summary',
    title: siteTitle,
    description: siteDescription,
    ...(openGraphImageUrl ? { images: [openGraphImageUrl] } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },
  category: 'productivity',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
