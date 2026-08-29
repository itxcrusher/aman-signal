"use client";

import { useCallback, useEffect, useState } from "react";
import { stringsFor, type Lang } from "@/lib/i18n";

/**
 * What became of the reports this person sent.
 *
 * Reporting into silence is the most demoralising part of any reporting system:
 * someone describes the worst hour of their life and then has no idea whether a
 * human ever saw it. This is the answer to that, and it is deliberately honest.
 * "Not yet reviewed" is shown as exactly that rather than dressed up as progress,
 * because a reassuring lie here costs trust at the moment it matters most.
 *
 * It is also where a reporter can say the danger has passed, which is the one piece
 * of information only they hold and which frees a team to go elsewhere.
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
  safe: boolean;
};

export default function MyReports({
  reporterId,
  lang,
}: {
  reporterId: string;
  lang: Lang;
}) {
  const t = stringsFor(lang);
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  async function markSafe(reportId: string, safe: boolean) {
    setBusy(reportId);
    try {
      await fetch("/api/my-reports/safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reporter_id: reporterId, report_id: reportId, safe }),
      });
      await load();
    } catch {
      /* The refresh below will show the true state either way. */
    } finally {
      setBusy(null);
    }
  }

  function whenText(ms: number): string {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return t.justNow;
    if (mins < 60) return t.minutesAgo(mins);
    const hours = Math.round(mins / 60);
    if (hours < 24) return t.hoursAgo(hours);
    return t.daysAgo(Math.round(hours / 24));
  }

  function stateText(r: MyReport): { text: string; tone: string } {
    if (r.safe) return { text: t.stateSafe, tone: "text-ok" };
    switch (r.incident_status) {
      case "new":
        return { text: t.stateNew, tone: "text-ink-soft" };
      case "verified":
        return { text: t.stateVerified, tone: "text-ok" };
      case "assigned":
        return { text: t.stateAssigned, tone: "text-ok" };
      case "responding":
        return { text: t.stateResponding, tone: "text-ok" };
      case "resolved":
        return { text: t.stateResolved, tone: "text-ink-soft" };
      default:
        return { text: t.stateNotReviewed, tone: "text-ink-soft" };
    }
  }

  if (failed && !reports) {
    return (
      <div className="rounded-2xl bg-day-surface p-5 text-center ring-1 ring-day-line">
        <p className={`${t.face} text-base font-semibold`}>{t.myReportsFailed}</p>
        <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.myReportsFailedBody}</p>
        <button
          type="button"
          onClick={load}
          className={`${t.face} mt-3 rounded-xl bg-brand/10 px-4 py-2 text-sm font-medium text-brand ring-1 ring-brand`}
        >
          {t.tryAgain}
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
        <p className={`${t.face} text-base font-semibold`}>{t.myReportsEmpty}</p>
        <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.myReportsEmptyBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const state = stateText(r);
        return (
          <article key={r.id} className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
            <div className="flex items-baseline justify-between gap-3">
              <p className={`${t.face} text-base font-bold ${state.tone}`}>{state.text}</p>
              <span className={`${t.face} shrink-0 text-xs text-ink-soft`}>
                {whenText(r.created_at)}
              </span>
            </div>

            {r.assigned_to ? (
              <p className={`${t.face} mt-2 rounded-xl bg-ok/10 px-3 py-2 text-sm font-medium text-ok`}>
                {t.team}: {r.assigned_to}
              </p>
            ) : null}

            {r.summary_urdu ? (
              <p className="urdu mt-3 border-t border-day-line pt-3 text-base leading-loose" dir="auto">
                {r.summary_urdu}
              </p>
            ) : r.summary ? (
              <p className={`${t.face} mt-3 border-t border-day-line pt-3 text-sm`} dir="auto">
                {r.summary}
              </p>
            ) : null}

            <p className={`${t.face} mt-2 text-xs text-ink-soft`}>
              {[
                r.had_voice ? t.attachedVoice : null,
                r.had_photo ? t.attachedPhoto : null,
                r.located ? t.attachedLocation : t.attachedNoLocation,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {/* Only they know the danger has passed. Saying so does not close the
                incident, since their neighbours may still be in it, but it tells a
                dispatcher a team can go elsewhere. Reversible, because people tap
                the wrong thing under stress. */}
            <div className="mt-4 border-t border-day-line pt-4">
              {r.safe ? (
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => markSafe(r.id, false)}
                  className={`${t.face} text-sm text-ink-soft underline underline-offset-4 disabled:opacity-50`}
                >
                  {busy === r.id ? t.markingSafe : t.undoSafe}
                </button>
              ) : (
                <>
                  <p className={`${t.face} text-sm font-semibold`}>{t.markSafeTitle}</p>
                  <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.markSafeBody}</p>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => markSafe(r.id, true)}
                    className={`${t.face} mt-3 w-full rounded-xl bg-ok/10 px-4 py-3 text-base font-semibold text-ok ring-1 ring-ok disabled:opacity-50`}
                  >
                    {busy === r.id ? t.markingSafe : t.markSafe}
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
