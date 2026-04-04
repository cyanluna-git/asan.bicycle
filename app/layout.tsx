import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ProfileGate } from "@/components/profile/profile-gate";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { getSiteUrl } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() ||
  undefined;

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Wheeling — 전국 자전거 코스 탐색",
  description: "전국 자전거 코스를 탐색하고 공유하는 라이딩 커뮤니티",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={<HeaderSkeleton />}>
          <Header />
        </Suspense>
        <ProfileGate>
          <div className="pt-16">{children}</div>
        </ProfileGate>
      </body>
    </html>
  );
}

function HeaderSkeleton() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background" />
  );
}
