import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { DevPreviewSwitcher } from "@/components/dev/dev-preview-switcher";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const syne = Syne({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-logo" });

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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${syne.variable}`}>
      <body className="font-sans antialiased bg-[#F8F9FB] text-slate-900">
        <NavigationProgress />
        {children}
        {isDevPreviewAllowed() && <DevPreviewSwitcher />}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
