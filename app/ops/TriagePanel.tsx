"use client";

import { useState } from "react";
import { labelFor, URGENCY, ROAD, type Lang } from "@/lib/i18n";
import { URGENCY_INDICATORS, ROAD_ACCESS } from "@/lib/schema";
import type { OpsStrings } from "@/lib/i18n-ops";

/**
 * The queue of reports the model could not read.
 *
 * Kept visually distinct from the incident board and from the duplicate queue,
 * because it asks a different question. The duplicate queue asks "is this the
 * same emergency?"; this asks "what does this say?", and the only way to answer
 * it is to listen to the recording and look at the photo. So the evidence is
 * open by default here rather than behind a details button: a collapsed panel
 * would put one click between an operator and the only readable thing in the
 * record.
 */

export type Unreadable = {
  id: string;
  created_at: number;
  raw_text: string | null;
  has_audio: boolean;
  has_image: boolean;
  location_text: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  queued_offline: boolean;
  failure: string | null;
};

export function TriagePanel({
  items,
  t,
  lang,
  operator,
  onDone,
  timeAgo,
}: {
  items: Unreadable[];
  t: OpsStrings;
  lang: Lang;
  operator: string;
  onDone: () => void;
  timeAgo: (ms: number) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [urgency, setUrgency] = useState<string[]>([]);
  const [people, setPeople] = useState("");
  const [road, setRoad] = useState("unknown");
  const [busy, setBusy] = useState(false);

  function reset() {
    setOpenId(null);
    setSummary("");
    setUrgency([]);
    setPeople("");
    setRoad("unknown");
  }

  async function submit(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/triage/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, ...body }),
      });
      reset();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return null;

  return (
    <section className="mb-6 rounded-2xl border border-warn/40 bg-warn/5 p-5">
      <h2 className={`${t.face} text-sm font-semibold text-warn`}>
        {t.needsReading} &middot; {items.length}
      </h2>
      <p className={`${t.face} mb-4 mt-1 max-w-3xl text-xs leading-relaxed text-paper-soft`}>
        {t.needsReadingWhy}
      </p>

      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="mono text-xs text-paper-soft">
              {timeAgo(r.created_at)}
              {r.reporter_name ? ` · ${r.reporter_name}` : ""}
              {r.reporter_phone ? ` · ${r.reporter_phone}` : ""}
              {r.location_text ? ` · ${r.location_text}` : ""}
              {r.queued_offline ? ` · ${t.sentFromOutbox}` : ""}
            </p>

            {r.raw_text ? (
              <p className="mt-2 text-sm text-paper" dir="auto">
                {r.raw_text}
              </p>
            ) : null}

            {/* The evidence itself, which is the whole reason this row exists. */}
            {r.has_audio ? (
              <div className="mt-3">
                <p className={`${t.face} mb-1 text-xs text-paper-soft`}>{t.voiceNote}</p>
                <audio
                  controls
                  preload="none"
                  src={`/api/media/${r.id}?kind=audio`}
                  className="w-full"
                />
              </div>
            ) : null}
            {r.has_image ? (
              <div className="mt-3">
                <p className={`${t.face} mb-1 text-xs text-paper-soft`}>{t.photo}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/${r.id}?kind=image`}
                  alt=""
                  className="max-h-72 rounded-lg border border-line"
                />
              </div>
            ) : null}
            {!r.has_audio && !r.has_image && !r.raw_text ? (
              <p className={`${t.face} mt-2 text-xs text-warn`}>{t.nothingReadable}</p>
            ) : null}

            {openId === r.id ? (
              <div className="mt-4 border-t border-line pt-4">
                <label className={`${t.face} block text-xs text-paper-soft`}>{t.whatItSays}</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  dir="auto"
                  placeholder={t.whatItSaysPlaceholder}
                  className="mt-1 w-full rounded-lg border border-line bg-surface-2 p-2 text-sm text-paper"
                />

                <p className={`${t.face} mt-3 text-xs text-paper-soft`}>{t.situation}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {URGENCY_INDICATORS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() =>
                        setUrgency((cur) =>
                          cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u],
                        )
                      }
                      className={`${t.face} cursor-pointer rounded-lg px-3 py-1.5 text-xs ring-1 ${
                        urgency.includes(u)
                          ? "bg-critical/20 text-red-200 ring-critical"
                          : "bg-surface-2 text-paper-soft ring-line"
                      }`}
                    >
                      {labelFor(URGENCY, u, lang)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <div>
                    <label className={`${t.face} block text-xs text-paper-soft`}>
                      {t.peopleAffected}
                    </label>
                    <input
                      value={people}
                      onChange={(e) => setPeople(e.target.value.replace(/[^0-9]/g, ""))}
                      inputMode="numeric"
                      placeholder={t.notGiven}
                      className="mt-1 w-32 rounded-lg border border-line bg-surface-2 p-2 text-sm text-paper"
                    />
                  </div>
                  <div>
                    <label className={`${t.face} block text-xs text-paper-soft`}>
                      {t.roadAccess}
                    </label>
                    <select
                      value={road}
                      onChange={(e) => setRoad(e.target.value)}
                      className={`${t.face} mt-1 rounded-lg border border-line bg-surface-2 p-2 text-sm text-paper`}
                    >
                      {ROAD_ACCESS.map((x) => (
                        <option key={x} value={x}>
                          {labelFor(ROAD, x, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className={`${t.face} mt-3 text-xs text-paper-soft`}>{t.readingIsYours}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !summary.trim()}
                    onClick={() =>
                      submit(r.id, {
                        summary: summary.trim(),
                        incident_type: "flood",
                        urgency_indicators: urgency,
                        people_affected: people ? Number(people) : null,
                        road_access: road,
                      })
                    }
                    className={`${t.face} cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {t.createFromReading}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submit(r.id, { dismiss: true, reason: summary.trim() })}
                    className={`${t.face} cursor-pointer rounded-lg bg-surface-2 px-4 py-2 text-sm text-paper-soft ring-1 ring-line`}
                  >
                    {t.notAnEmergency}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className={`${t.face} cursor-pointer rounded-lg px-4 py-2 text-sm text-paper-soft`}
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpenId(r.id);
                }}
                className={`${t.face} mt-3 cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white`}
              >
                {t.readAndEnter}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
