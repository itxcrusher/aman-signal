/**
 * The AmanSignal mark: two arcs rising from a point above a waterline.
 *
 * A transmission from somewhere specific, which is what the product is. It is
 * deliberately not a seal. Every existing Pakistani relief identity is heraldic,
 * a cross in a laurel wreath under a crescent, a quartered circle of flame and
 * water, and borrowing that grammar would imply an official authority AmanSignal
 * does not have. That is the same failure as implying the AI dispatches, and it
 * is avoidable for free.
 *
 * Four strokes and a dot, so it survives to a 16px favicon. Takes `currentColor`,
 * so it inherits deep green on the citizen surface and the lifted green on the
 * board without either caller knowing which it is.
 */
export default function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <MarkGlyph />
    </svg>
  );
}

/**
 * The strokes alone, in the 48-unit square, with no <svg> of their own.
 *
 * Exported so the logo lockup can place the same geometry inside its own
 * viewBox. The mark is drawn once and only once; a second copy is a second
 * thing to forget to change.
 */
export function MarkGlyph() {
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
        <path d="M11.5 25.5a17 17 0 0 1 25 0" />
        <path d="M17 31.5a9.5 9.5 0 0 1 14 0" />
        <path d="M5 41h38" />
        <path d="M5 45.5h38" opacity="0.42" />
      </g>
      <circle cx="24" cy="36.5" r="2.9" fill="currentColor" />
    </>
  );
}
