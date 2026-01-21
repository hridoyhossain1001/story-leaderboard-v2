import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const abcDiatype = localFont({
  src: [
    {
      path: "../public/fonts/ABCDiatype-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ABCDiatype-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-abcdiatype",
});

export const metadata: Metadata = {
  title: "Story Protocol Leaderboard",
  description: "Live tracking of .ip domain activity",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${abcDiatype.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
