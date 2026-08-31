import type { Metadata, Viewport } from "next";
import { Lexend, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font rather than pulled from a CDN at runtime:
 * the product is used on poor connections, and a blocked or slow font host must
 * not delay an emergency report.
 *
 * Weights are deliberately few. Measured on this build, the four weights of Noto
 * Sans Arabic came to 983kB on disk, more than the three of Nastaliq at 794kB, and
 * the citizen app no longer loads it at all. Every weight below earns its place.
 */

/**
 * Urdu, everywhere a citizen reads. Nastaliq is what Urdu readers expect; Naskh
 * reads to them as Arabic and loses the Urdu identity. Two weights only: regular
 * for reading and bold for the one emphasis level the screens actually use.
 */
const nastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-nastaliq",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
});

/**
 * Latin on the citizen app. Drawn to improve reading proficiency, which is the
 * right property for a screen read once, under stress, possibly by someone who
 * reads little. Also carries Roman Urdu, which is Latin script.
 */
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AmanSignal",
  description: "Urdu-first incident intelligence for disaster response",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B5D53",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${nastaliq.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
