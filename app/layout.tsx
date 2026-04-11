import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Epilogue, Inter } from "next/font/google";
import { ProfileGate } from "@/components/profile/profile-gate";
import { InstallPromptBanner } from "@/components/pwa/install-prompt-banner";
import { NotificationPrompt } from "@/components/pwa/notification-prompt";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { RegionProvider } from "@/lib/region-context";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getSiteUrl } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const epilogue = Epilogue({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ||
  undefined;

const siteUrl = getSiteUrl();
const defaultTitle = "굴림 — 전국 자전거 코스 탐색";
const defaultDescription = "전국 자전거 코스를 탐색하고 공유하는 라이딩 커뮤니티";
const defaultOgImage = "/opengraph-image?v=20260411";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultTitle,
  description: defaultDescription,
  alternates: {
    canonical: `${siteUrl}/`,
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${siteUrl}/`,
    siteName: "굴림",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: "굴림",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [defaultOgImage],
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#994200" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="굴림" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${epilogue.variable} ${inter.variable} antialiased`}
      >
        <RegionProvider>
          <Suspense fallback={<HeaderSkeleton />}>
            <Header />
          </Suspense>
          <ProfileGate>
            <div className="pt-16 pb-16 md:pb-0">{children}</div>
          </ProfileGate>
          <Footer />
        </RegionProvider>
        <BottomNav />
        <ServiceWorkerRegister />
        <InstallPromptBanner />
        <NotificationPrompt />
      </body>
    </html>
  );
}

function HeaderSkeleton() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background" />
  );
}
