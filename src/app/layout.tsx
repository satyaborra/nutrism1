import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NutriSLM — Multimodal Personalized Nutrition Intelligence",
  description:
    "Describe food in any language or snap a photo — NutriSLM parses it with AI, verifies nutrition against IFCT/USDA facts, enforces clinical constraints (T2DM/CKD/CVD) with cited evidence, and recommends your next meal.",
  keywords: ["nutrition", "AI", "health", "food logging", "diabetes", "diet", "NutriSLM"],
  authors: [{ name: "NutriSLM" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "NutriSLM",
    description: "Multimodal personalized nutrition intelligence platform",
    siteName: "NutriSLM",
    type: "website",
  },
};

export const viewport: Viewport = {
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
