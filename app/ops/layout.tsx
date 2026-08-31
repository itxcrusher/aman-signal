import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

/**
 * The operator board's typefaces, loaded only on the operator board.
 *
 * They were declared in the root layout, so every citizen downloaded two faces
 * they would never see. That is the wrong way round: the operator is indoors on
 * a laptop with a working connection, and the citizen is the one on a phone in a
 * flood, so any byte that can be moved off their path should be.
 *
 * Nastaliq and Lexend stay in the root layout, because both surfaces use them:
 * Urdu appears on the board as quoted citizen evidence, and Latin appears
 * everywhere.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

/** Every figure that must line up: similarity scores, distances, the audit trail. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${plexSans.variable} ${plexMono.variable} contents`}>{children}</div>;
}
