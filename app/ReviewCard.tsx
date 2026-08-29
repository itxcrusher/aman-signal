"use client";

import type { Extraction } from "@/lib/schema";
import { URGENCY_INDICATORS, VULNERABLE_GROUPS, ROAD_ACCESS } from "@/lib/schema";
import { labelFor, URGENCY, VULNERABLE, ROAD, FIELD_LABEL, type Lang, type Strings } from "@/lib/i18n";

/**
 * What the model understood, offered back for correction.
 *
 * The screen has always said "correct it if it is wrong" and until now nothing on
 * it could be changed, which made the promise false at exactly the moment accuracy
 * matters most. Every extracted field is now directly editable: chips toggle on a
 * single tap, the count is a number field, the transcript is a text area.
 *
 * There is deliberately no edit mode. A mode is one more thing to discover, and
 * discovering it costs taps that someone standing in water does not have. What is
 * shown is what is editable.
 *
 * The corrected object is sent as `corrected` on confirmation and revalidated
 * server-side against the schema, so an edit cannot smuggle through a value the
 * operator's board would not understand.
 */
export default function ReviewCard({
  extraction,
  onChange,
  lang,
  t,
  onSpeak,
  speaking,
  spoken,
}: {
  extraction: Extraction;
  onChange: (e: Extraction) => void;
  lang: Lang;
  t: Strings;
  onSpeak: (s: string) => void;
  speaking: boolean;
  spoken: string;
}) {
  const set = (patch: Partial<Extraction>) => onChange({ ...extraction, ...patch });

  function toggle<T extends string>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className={`${t.face} text-lg font-bold`}>{t.weUnderstood}</h2>
          <p className={`${t.face} text-sm text-ink-soft`}>{t.correctIt}</p>
        </div>
        <button
          type="button"
          onClick={() => onSpeak(spoken)}
          aria-label={t.listen}
          className={`${t.face} shrink-0 cursor-pointer rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white`}
        >
          {speaking ? t.playing : t.listen}
        </button>
      </div>

      <div className="space-y-5">
        {/* Situation. All options are shown, not just the detected ones, because
            adding something the model missed matters as much as removing something
            it invented, and a hidden option gets neither. */}
        <div>
          <p className={`${t.face} mb-2 text-sm text-ink-soft`}>{t.situation}</p>
          <div className="flex flex-wrap gap-2">
            {URGENCY_INDICATORS.map((u) => {
              const on = extraction.urgency_indicators.includes(u);
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ urgency_indicators: toggle(extraction.urgency_indicators, u) })}
                  className={`${t.face} rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                    on
                      ? "bg-amber-100 text-amber-900 ring-amber-300"
                      : "bg-day text-ink-soft ring-day-line"
                  }`}
                >
                  {labelFor(URGENCY, u, lang)}
                </button>
              );
            })}
          </div>
        </div>

        {/* People affected. Never summed across reports at the incident layer, but
            here it is simply what this one person says about their own situation. */}
        <div>
          <label htmlFor="people" className={`${t.face} mb-2 block text-sm text-ink-soft`}>
            {t.peopleAffected}
          </label>
          <input
            id="people"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            dir="ltr"
            value={extraction.people_affected ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              const n = Number.parseInt(v, 10);
              set({ people_affected: v === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
            }}
            className="w-28 rounded-xl border border-day-line bg-day px-4 py-3 text-lg font-semibold outline-none focus:border-brand"
          />
        </div>

        <div>
          <p className={`${t.face} mb-2 text-sm text-ink-soft`}>{t.vulnerablePresent}</p>
          <div className="flex flex-wrap gap-2">
            {VULNERABLE_GROUPS.map((v) => {
              const on = extraction.vulnerable_people.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ vulnerable_people: toggle(extraction.vulnerable_people, v) })}
                  className={`${t.face} rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                    on ? "bg-slate-200 text-ink ring-slate-300" : "bg-day text-ink-soft ring-day-line"
                  }`}
                >
                  {labelFor(VULNERABLE, v, lang)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Road access decides whether a vehicle can be sent at all, so it is worth
            a correction even when everything else is right. */}
        <div>
          <p className={`${t.face} mb-2 text-sm text-ink-soft`}>
            {labelFor(FIELD_LABEL, "road_access", lang)}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROAD_ACCESS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={extraction.road_access === r}
                onClick={() => set({ road_access: r })}
                className={`${t.face} rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                  extraction.road_access === r
                    ? "bg-brand text-white ring-brand"
                    : "bg-day text-ink-soft ring-day-line"
                }`}
              >
                {labelFor(ROAD, r, lang)}
              </button>
            ))}
          </div>
        </div>

        {/* The transcript. At roughly 12% word error rate this is the field most
            likely to be wrong, and the one the reporter is best placed to fix. */}
        {extraction.transcript_urdu || extraction.transcript_roman_urdu ? (
          <div>
            <label htmlFor="heard" className={`${t.face} mb-2 block text-sm text-ink-soft`}>
              {t.whatWeHeard}
            </label>
            <textarea
              id="heard"
              dir="auto"
              rows={3}
              value={extraction.transcript_urdu || extraction.transcript_roman_urdu}
              onChange={(e) =>
                set(
                  extraction.transcript_urdu
                    ? { transcript_urdu: e.target.value }
                    : { transcript_roman_urdu: e.target.value },
                )
              }
              className={`${
                extraction.transcript_urdu ? "urdu" : "roman-urdu"
              } w-full rounded-xl border border-day-line bg-day p-4 text-base outline-none focus:border-brand`}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
