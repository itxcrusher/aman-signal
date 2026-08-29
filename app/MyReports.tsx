"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * What became of the reports this person sent.
 *
 * Reporting into silence is the most demoralising part of any reporting system:
 * someone describes the worst hour of their life and then has no idea whether a
 * human ever saw it. This is the answer to that, and it is deliberately honest.
 * "Not yet reviewed" is shown as exactly that rather than dressed up as progress,
 * because a reassuring lie here costs trust at the moment it matters most.
 */

type MyReport = {
  id: string;
  created_at: number;
  state: string;
  summary: string | null;
  summary_urdu: string | null;
  urgency: string[];
  had_voice: boolean;
  had_photo: boolean;
  located: boolean;
  incident_status: string | null;
  assigned_to: string | null;
};

/** Operational states, said in the words a reporter would use about themselves. */
const STATE: Record<string, { ur: string; en: string; tone: string }> = {
  none: {
    ur: "موصول ہو گئی، ابھی دیکھی نہیں گئی",
    en: "Received. Not yet reviewed by the control room.",
    tone: "text-ink-soft",
  },
  new: {
    ur: "موصول ہو گئی، جائزہ باقی ہے",
    en: "Received. Waiting for the control room to review it.",
    tone: "text-ink-soft",
  },
  verified: {
    ur: "تصدیق ہو گئی",
    en: "Verified by the control room.",
    tone: "text-ok",
  },
  assigned: {
    ur: "ٹیم مقرر کر دی گئی ہے",
    en: "A team has been assigned to you.",
    tone: "text-ok",
  },
  responding: {
    ur: "ٹیم راستے میں ہے",
    en: "A team is on its way.",
    tone: "text-ok",
  },
  resolved: {
    ur: "مکمل ہو گیا",
    en: "Marked resolved.",
    tone: "text-ink-soft",
  },
};

function whenText(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function MyReports({ reporterId }: { reporterId: string }) {
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!reporterId) return;
    try {
      const res = await fetch(`/api/my-reports?reporter_id=${encodeURIComponent(reporterId)}`);
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      setReports(json.reports ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [reporterId]);

  useEffect(() => {
    load();
    // Someone watching this screen is waiting for an answer, so it refreshes
    // itself rather than making them pull to refresh while they wait.
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (failed && !reports) {
    return (
      <div className="rounded-2xl bg-day-surface p-5 text-center ring-1 ring-day-line">
        <p className="urdu-ui text-base">آپ کی اطلاعات نہیں کھل سکیں</p>
        <p className="en mt-1 text-sm text-ink-soft">
          Could not load your reports. Check your connection.
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-xl bg-brand/10 px-4 py-2 text-sm font-medium text-brand ring-1 ring-brand"
        >
          Try again
        </button>
      </div>
    );
  }

  if (reports === null) {
    return <div className="h-32 rounded-2xl bg-day-surface ring-1 ring-day-line" aria-busy="true" />;
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl bg-day-surface p-6 text-center ring-1 ring-day-line">
        <p className="urdu-ui text-base font-semibold">ابھی تک آپ نے کوئی اطلاع نہیں بھیجی</p>
        <p className="en mt-1 text-sm text-ink-soft">
          You have not sent any reports yet. Anything you send will appear here, with
          what the control room has done about it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const key = r.incident_status ?? "none";
        const state = STATE[key] ?? STATE.none;
        return (
          <article
            key={r.id}
            className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className={`urdu-ui text-base font-bold ${state.tone}`}>{state.ur}</p>
              <span className="en shrink-0 text-xs text-ink-soft">{whenText(r.created_at)}</span>
            </div>
            <p className={`en mt-1 text-sm ${state.tone}`}>{state.en}</p>

            {r.assigned_to ? (
              <p className="en mt-2 rounded-xl bg-ok/10 px-3 py-2 text-sm font-medium text-ok">
                Team: {r.assigned_to}
              </p>
            ) : null}

            {r.summary_urdu ? (
              <p className="urdu mt-3 border-t border-day-line pt-3 text-base leading-loose">
                {r.summary_urdu}
              </p>
            ) : r.summary ? (
              <p className="en mt-3 border-t border-day-line pt-3 text-sm">{r.summary}</p>
            ) : null}

            <p className="en mt-2 text-xs text-ink-soft">
              {[
                r.had_voice ? "voice note" : null,
                r.had_photo ? "photo" : null,
                r.located ? "location attached" : "no location",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </article>
        );
      })}
    </div>
  );
}
