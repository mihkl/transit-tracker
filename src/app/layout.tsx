import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
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
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });

                (async () => {
                  try {
                    const reg = await navigator.serviceWorker.register('/sw.js');
                    void reg.update();
                  } catch (err) {
                    console.error('SW registration failed', err);
                  }
                })();
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
