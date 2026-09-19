import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SwRegister } from "@/components/nutrislm/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Handwritten accent font for decorative script lines ("Fuel Your Better Tomorrow"). */
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "NutriSLM — Multimodal Personalized Nutrition Intelligence",
  description:
    "Describe food in any language or snap a photo — NutriSLM parses it with AI, verifies nutrition against IFCT/USDA facts, enforces clinical constraints (T2DM/CKD/CVD) with cited evidence, and recommends your next meal.",
  keywords: ["nutrition", "AI", "health", "food logging", "diabetes", "diet", "NutriSLM"],
  authors: [{ name: "NutriSLM" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "NutriSLM",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "NutriSLM",
    description: "Multimodal personalized nutrition intelligence platform",
    siteName: "NutriSLM",
    type: "website",
    images: [{ url: "/images/nutrislm-logo.png", width: 1254, height: 1254, alt: "NutriSLM — Eat Smarter · Live Healthier" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#064e3b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
          <SwRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
