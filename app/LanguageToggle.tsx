"use client";

import { LANGUAGES, type Lang } from "@/lib/i18n";

/**
 * Switch language from anywhere.
 *
 * Someone can pick wrong on the first screen, or hand the phone to a neighbour who
 * reads the other language. Both are ordinary, and neither should mean reinstalling
 * or hunting through settings, so the switch sits in the header on every screen.
 */
export default function LanguageToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <div
      dir="ltr"
      role="group"
      aria-label="Language"
      className="flex shrink-0 rounded-xl bg-day-surface p-1 ring-1 ring-day-line"
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            lang === l.code ? "bg-brand text-white" : "text-ink-soft"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
