import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://castly.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "Castly — Build worlds together by typing",
    template: "%s | Castly",
  },
  description:
    "Type anything and watch it appear in 3D for everyone. A multiplayer playground where you co-create shared worlds with natural language. No signup required.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "Castly — Build worlds together by typing",
    description:
      "Type anything and watch it appear in 3D for everyone. No signup required.",
    url: SITE_URL,
    siteName: "Castly",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Castly — Build worlds together by typing",
    description:
      "Type anything and watch it appear in 3D for everyone. No signup required.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
