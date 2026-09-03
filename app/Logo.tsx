import { MarkGlyph } from "./Mark";
import { WORDMARK, METRICS } from "./logo-path";

/**
 * The AmanSignal logo: the mark and the wordmark as one object.
 *
 * The wordmark is outlines rather than text, so the logo here is byte-identical
 * to the one in the presentation, the briefs and the link preview. Setting it
 * as live text would mean loading a display face on a product whose whole
 * premise is a bad connection, and it would still not match anywhere the face
 * failed to load.
 *
 * Sized by height: give it a height class and the width follows. Takes
 * `currentColor`, so a caller sets the colour and never the geometry.
 */
export default function Logo({ className = "" }: { className?: string }) {
  const m = METRICS;
  return (
    <svg
      viewBox={`0 ${m.view.y} ${m.view.w} ${m.view.h}`}
      role="img"
      aria-label="AmanSignal"
      focusable="false"
      className={className}
    >
      <title>AmanSignal</title>
      <g transform={`translate(${m.mark.x} ${m.mark.y}) scale(${m.mark.scale})`}>
        <MarkGlyph />
      </g>
      <path transform={`translate(${m.wordX} 0)`} d={WORDMARK} fill="currentColor" />
    </svg>
  );
}
