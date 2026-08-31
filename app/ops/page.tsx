"use client";

import { useEffect, useState, useCallback } from "react";
import Mark from "../Mark";
import IncidentMap from "./IncidentMap";
import IncidentDetail from "./IncidentDetail";
import OpsOnboarding, { type OpsIdentity } from "./OpsOnboarding";
import type { Incident } from "./types";
import { districtName } from "@/lib/districts";
import { STATUS_FLOW } from "@/lib/incident";
import { opsStringsFor } from "@/lib/i18n-ops";
import { labelFor, URGENCY, VULNERABLE, LANGUAGES, type Lang } from "@/lib/i18n";

type PendingDup = {
  id: string;
  created_at: number;
  raw_text: string | null;
  summary: string | null;
  urgency: string[];
  people_affected: number | null;
  locations: string[];
  candidates: {
    incident_id: string;
    incident_summary: string | null;
    incident_status: string;
    similarity: number;
    distance_m: number | null;
    geo_confirmed: boolean;
    method: string;
  }[];
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-critical/15 text-red-300 ring-critical/40",
  verified: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  assigned: "bg-blue-500/15 text-blue-300 ring-blue-500/40",
  responding: "bg-teal-500/15 text-teal-300 ring-teal-500/40",
  resolved: "bg-slate-500/15 text-slate-400 ring-slate-500/40",
};

/**
 * Offer the next step forward in the flow, plus resolve. Offering "mark new" on
 * an assigned incident invites an accidental regression of live operational state.
 */
function nextStatuses(current: string): string[] {
  const i = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
  if (i === -1) return ["verified"];
  const out = [...STATUS_FLOW.slice(i + 1, i + 2)];
  if (current !== "resolved" && !out.includes("resolved")) out.push("resolved");
  return out;
}

function timeAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const IDENTITY_KEY = "amansignal.ops";

export default function OpsBoard() {
  // undefined while localStorage is being read, null when setup is needed.
  const [identity, setIdentity] = useState<OpsIdentity | null | undefined>(undefined);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pending, setPending] = useState<PendingDup[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [team, setTeam] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Setup guarantees a name before the board renders, so no action can be
  // unattributed and no guard has to refuse one at the point of a click.
  const operator = identity?.operator ?? "";
  const t = opsStringsFor(identity?.lang);
  const lang: Lang = identity?.lang ?? "en";

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/incidents"), fetch("/api/duplicates")]);
      const inc = await a.json();
      const dup = await b.json();
      setIncidents(inc.incidents ?? []);
      setPending(dup.pending ?? []);
      setErr(null);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<OpsIdentity>;
        if (p.operator && p.district) {
          setIdentity({
            operator: p.operator,
            district: p.district,
            organisation: p.organisation ?? "",
            lang: p.lang === "ur" ? "ur" : "en",
          });
          return;
        }
      }
    } catch {
      /* A browser refusing storage just means setting up again. */
    }
    setIdentity(null);
  }, []);

  function saveIdentity(next: OpsIdentity) {
    setIdentity(next);
    setEditingIdentity(false);
    setErr(null);
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    } catch {
      /* Not fatal: the board works, it just asks again next time. */
    }
  }

  function setLang(l: Lang) {
    if (identity) saveIdentity({ ...identity, lang: l });
  }

  async function advance(inc: Incident, status: string) {
    // Assigning needs a team name, collected inline rather than in a native
    // dialog: it must be styleable, testable, and must not block the tab.
    if (status === "assigned" && !(team[inc.id] ?? "").trim()) {
      setAssigning(inc.id);
      setErr(null);
      return;
    }
    const res = await fetch(`/api/incidents/${inc.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        operator,
        assigned_to: status === "assigned" ? team[inc.id]?.trim() : undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Status change failed.");
      return;
    }
    setErr(null);
    setAssigning(null);
    load();
  }

  /**
   * Change the responding team without moving the incident's status. The status
   * flow can only attach a team at the moment of assignment, so once an incident
   * is responding there is no way to record a different team taking it over.
   * That happens constantly, and a stale team name is worse than none.
   */
  async function reassign(inc: Incident) {
    const next = (team[inc.id] ?? "").trim();
    if (!next) {
      setReassigning(inc.id);
      setErr(null);
      return;
    }
    const res = await fetch(`/api/incidents/${inc.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team: next, operator }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Assignment failed.");
      return;
    }
    setErr(null);
    setReassigning(null);
    load();
  }

  async function resolveDuplicate(reportId: string, body: Record<string, unknown>) {
    const res = await fetch("/api/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, operator, ...body }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Could not resolve the duplicate.");
      return;
    }
    setErr(null);
    load();
  }

  /**
   * This room's incidents. One the system could not place is shown to every room
   * rather than hidden from all of them: several rooms seeing one unplaced
   * emergency costs a phone call, none seeing it costs far more.
   */
  const mine = incidents.filter((i) => i.district === identity?.district || i.district === null);
  const elsewhere = incidents.length - mine.length;
  const detail = detailId ? (mine.find((i) => i.id === detailId) ?? null) : null;

  if (identity === undefined) {
    return <main className="ops-surface min-h-screen bg-ground" aria-busy="true" />;
  }

  if (identity === null || editingIdentity) {
    return (
      <OpsOnboarding
        initial={identity}
        onDone={saveIdentity}
        onCancel={identity ? () => setEditingIdentity(false) : undefined}
      />
    );
  }

  return (
    <main dir={t.dir} className="ops-surface min-h-screen bg-ground text-paper">
      <header className="border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-soft">
              <Mark className="h-6 w-6 shrink-0" />
              AmanSignal <span className="font-normal text-paper-soft">{t.operations}</span>
            </h1>
            <p className={`${t.face} text-xs text-paper-soft`}>
              {districtName(identity.district, lang === "ur")} {t.controlRoom} &middot;{" "}
              {identity.operator}
              {identity.organisation ? ` · ${identity.organisation}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div dir="ltr" className="flex rounded-lg bg-surface p-1 ring-1 ring-line">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    lang === l.code ? "bg-brand text-white" : "text-paper-soft"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEditingIdentity(true)}
              className={`${t.face} rounded-lg px-3 py-2 text-sm text-paper-soft ring-1 ring-line transition-colors hover:text-paper`}
            >
              {t.change}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {err ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-critical/15 px-4 py-3 text-sm text-red-300 ring-1 ring-critical/40"
          >
            {err}
          </p>
        ) : null}

        {/* IncidentMap renders its own header; wrapping it in another one
            printed "INCIDENT MAP" twice. */}
        {mine.length ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-line">
            <IncidentMap
              incidents={mine}
              selectedId={detailId}
              onSelect={(id) => setDetailId(id)}
            />
          </div>
        ) : null}

        {pending.length ? (
          <section className="mb-6 rounded-2xl border border-critical/40 bg-critical/5 p-5">
            <h2 className={`${t.face} text-sm font-semibold text-red-300`}>
              {t.needsJudgement} &middot; {pending.length}
            </h2>
            <p className={`${t.face} mb-4 mt-1 max-w-3xl text-xs leading-relaxed text-paper-soft`}>
              {t.needsJudgementWhy}
            </p>
            <ul className="space-y-3">
              {pending.map((p) => (
                <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-sm text-paper" dir="auto">
                    {p.summary ?? p.raw_text ?? "(no summary)"}
                  </p>
                  <p className="mono mt-1 text-xs text-paper-soft">
                    {timeAgo(p.created_at)}
                    {p.people_affected !== null ? ` · ${p.people_affected} affected` : ""}
                    {p.locations.length ? ` · ${p.locations.join(", ")}` : ""}
                  </p>
                  {p.candidates.map((c) => (
                    <div key={c.incident_id} className="mt-3 border-t border-line pt-3">
                      <p className={`${t.face} text-xs text-paper-soft`}>
                        {t.resembles}:{" "}
                        <span className="text-paper">{c.incident_summary ?? c.incident_id}</span>
                      </p>
                      <p className="mono mt-1 text-xs text-paper-soft">
                        similarity {c.similarity.toFixed(4)}
                        {c.distance_m !== null ? ` · ${Math.round(c.distance_m)}m away` : ""} ·{" "}
                        {c.method}
                        {!c.geo_confirmed ? <span className="text-warn"> · geo not confirmed</span> : null}
                      </p>
                    </div>
                  ))}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        resolveDuplicate(p.id, { link_to: p.candidates[0]?.incident_id })
                      }
                      className={`${t.face} cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white`}
                    >
                      {t.sameIncident}
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveDuplicate(p.id, { separate: true })}
                      className={`${t.face} cursor-pointer rounded-lg bg-surface-2 px-4 py-2 text-sm ring-1 ring-line`}
                    >
                      {t.separateEmergency}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {loading ? (
          <p className={`${t.face} text-paper-soft`}>{t.loading}</p>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <p className={`${t.face} font-semibold`}>
              {t.nothingOpen} {districtName(identity.district, lang === "ur")}
            </p>
            <p className={`${t.face} mt-1 text-sm text-paper-soft`}>{t.nothingOpenWhy}</p>
            {elsewhere > 0 ? (
              <p className={`${t.face} mt-3 text-sm text-paper-soft`}>
                {t.elsewhereCount(elsewhere, districtName(identity.district, lang === "ur"))}
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {elsewhere > 0 ? (
              <li className={`${t.face} px-1 text-xs text-paper-soft`}>
                {t.showingCount(mine.length, districtName(identity.district, lang === "ur"), elsewhere)}
              </li>
            ) : null}

            {/* The card carries only what decides whether to act. Everything else
                is one click away, because a dispatcher scanning twenty incidents
                and a dispatcher reading one need different screens, and serving
                both on the card served neither. */}
            {mine.map((inc) => (
              <li
                key={inc.id}
                id={`incident-${inc.id}`}
                className="rounded-2xl border border-line bg-surface"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${
                          STATUS_STYLE[inc.status] ?? STATUS_STYLE.new
                        }`}
                      >
                        {inc.status}
                      </span>
                      <span className="text-xs text-paper-soft">
                        {inc.incident_type.replace(/_/g, " ")} &middot; {timeAgo(inc.created_at)}
                      </span>
                      {inc.assigned_to ? (
                        <span className="text-xs text-blue-300">&rarr; {inc.assigned_to}</span>
                      ) : null}
                      {inc.corrected ? (
                        <span className={`${t.face} text-xs text-warn`}>{t.editIncident}</span>
                      ) : null}
                    </div>

                    <p className="mt-2 line-clamp-2 text-[15px] leading-snug text-paper">
                      {inc.summary ?? "(no summary)"}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {inc.urgency.slice(0, 3).map((u) => (
                        <span
                          key={u.indicator}
                          className={`${t.face} rounded bg-warn/15 px-2 py-0.5 text-xs text-warn`}
                        >
                          {labelFor(URGENCY, u.indicator, lang)}
                          {u.sources > 1 ? ` ×${u.sources}` : ""}
                        </span>
                      ))}
                      {inc.vulnerable.slice(0, 2).map((v) => (
                        <span
                          key={v}
                          className={`${t.face} rounded bg-surface-2 px-2 py-0.5 text-xs text-paper-soft`}
                        >
                          {labelFor(VULNERABLE, v, lang)}
                        </span>
                      ))}
                      {inc.conflicts.length ? (
                        <span className={`${t.face} rounded bg-critical/15 px-2 py-0.5 text-xs text-red-300`}>
                          {inc.conflicts.length} {t.disputed}
                        </span>
                      ) : null}
                    </div>

                    <p className={`${t.face} mt-2 text-xs text-paper-soft`}>
                      {t.distinctReports}: <span className="text-paper">{inc.quality.distinctReports}</span>
                      {" · "}
                      {t.location}: <span className="text-paper">{inc.quality.locationQuality}</span>
                      {inc.locations.length ? ` · ${inc.locations[0]}` : ""}
                    </p>
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-48">
                    {nextStatuses(inc.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => advance(inc, s)}
                        className={`${t.face} cursor-pointer rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium ring-1 ring-line transition-colors hover:bg-brand hover:text-white`}
                      >
                        {s === "verified"
                          ? t.markVerified
                          : s === "assigned"
                            ? t.markAssigned
                            : s === "responding"
                              ? t.markResponding
                              : t.markResolved}
                      </button>
                    ))}

                    {assigning === inc.id || reassigning === inc.id ? (
                      <div className="rounded-lg bg-surface-2 p-2 ring-1 ring-brand-soft">
                        <label
                          htmlFor={`team-${inc.id}`}
                          className={`${t.face} mb-1 block text-xs text-paper-soft`}
                        >
                          {reassigning === inc.id ? t.handOverTo : t.whichTeam}
                        </label>
                        <input
                          id={`team-${inc.id}`}
                          autoFocus
                          value={team[inc.id] ?? ""}
                          onChange={(e) => setTeam((x) => ({ ...x, [inc.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              reassigning === inc.id ? reassign(inc) : advance(inc, "assigned");
                            }
                            if (e.key === "Escape") {
                              setAssigning(null);
                              setReassigning(null);
                            }
                          }}
                          placeholder={inc.assigned_to ?? t.teamPlaceholder}
                          dir="auto"
                          className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-paper outline-none focus:border-brand-soft"
                        />
                      </div>
                    ) : inc.assigned_to ? (
                      <button
                        type="button"
                        onClick={() => reassign(inc)}
                        className={`${t.face} cursor-pointer rounded-lg px-3 py-2 text-sm text-paper-soft ring-1 ring-line transition-colors hover:bg-surface-2`}
                      >
                        {t.changeTeam}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setDetailId(inc.id)}
                      className={`${t.face} cursor-pointer rounded-lg bg-brand/15 px-3 py-2 text-sm font-medium text-brand-soft ring-1 ring-brand-soft/40`}
                    >
                      {t.viewDetails} ({inc.reports.length})
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail ? (
        <IncidentDetail
          incident={detail}
          t={t}
          lang={lang}
          operator={operator}
          onClose={() => setDetailId(null)}
          onSaved={load}
        />
      ) : null}
    </main>
  );
}
