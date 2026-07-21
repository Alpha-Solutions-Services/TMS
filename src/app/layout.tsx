import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { UiProvider } from "@/components/ui/UiProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alpha Freight Network TMS",
  description:
    "Transportation management for dispatchers, carriers, and drivers.",
  applicationName: "AFN TMS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AFN TMS",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/afn-logo.png", type: "image/png" }],
    apple: [{ url: "/afn-logo.png" }],
    shortcut: ["/afn-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${dmSans.variable}`}>
      <body className="min-h-screen antialiased">
        <UiProvider>
          {children}
          <PwaRegister />
        </UiProvider>
      </body>
    </html>
  );
}
