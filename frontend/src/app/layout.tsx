import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopBar, BottomTabs } from "@/components/Nav";

// Distinctive type: a warm humanist display serif (Fraunces) paired with a
// clean, highly legible grotesque body (Hanken Grotesk). Mono for case IDs.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  axes: ["opsz"],
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Setu — one registry, every center",
  description:
    "Offline-capable, cross-center missing-persons reunification for Kumbh Mela 2027.",
  manifest: "/manifest.webmanifest",
  applicationName: "Setu",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Setu" },
};

export const viewport: Viewport = {
  themeColor: "#e26a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-[100dvh] flex-col">
        <TopBar />
        <main className="page-pad has-tabbar mx-auto w-full max-w-6xl flex-1 py-5 sm:py-7">
          {children}
        </main>
        <BottomTabs />
      </body>
    </html>
  );
}
