import type { Metadata, Viewport } from "next";
import * as Sentry from "@sentry/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SentryUserContext } from "@/components/sentry-user-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Tallinn Ühistransport",
  description: "Real-time public transport tracking for Tallinn",
  other: {
    ...Sentry.getTraceData(),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ühistransport",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <SentryUserContext />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
