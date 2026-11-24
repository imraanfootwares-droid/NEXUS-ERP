import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const syne = Syne({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-logo-face" });

export const metadata: Metadata = {
  title: "Nexus ERP — Multi-Branch Billing, Stock & Storefront Platform",
  description:
    "All-in-one GST billing, size/colour stock matrix, factory-to-shop transfers, and live WhatsApp storefront for Indian manufacturing & retail.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1120",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${syne.variable}`}>
      <body className="font-sans antialiased bg-white text-slate-900">
        <NavigationProgress />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
