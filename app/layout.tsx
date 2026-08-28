import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font rather than pulled from a CDN at runtime:
 * the product is used on poor connections, and a blocked or slow font host must
 * not delay an emergency report.
 */
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

const nastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-nastaliq",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const naskh = Noto_Sans_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AmanSignal",
  description: "Urdu-first incident intelligence for disaster response",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d7d76",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${nastaliq.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
