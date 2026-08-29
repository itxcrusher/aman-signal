"use client";

import { useEffect, useState, useCallback } from "react";
import OpsOnboarding, { type OpsIdentity } from "./OpsOnboarding";
import { districtName } from "@/lib/districts";
import dynamic from "next/dynamic";
import { LABEL, STATUS_FLOW } from "@/lib/incident";

// Leaflet touches window at import time, so the map never renders on the server.
const IncidentMap = dynamic(() => import("./IncidentMap"), {
  ssr: false,
  loading: () => (
    <div className="mb-6 h-[440px] animate-pulse rounded-2xl border border-line bg-surface" />
  ),
});

type Report = {
  id: string;
  created_at: number;
  status: string;
  raw_text: string | null;
  has_audio: boolean;
  has_image: boolean;
  pin_adjusted: boolean;
  reporter_name: string | null;
  reporter_phone: string | null;
  latency_ms: number | null;
  model: string | null;
  repairs: string[];
  clarifications: { field: string; question: string; answer: string }[];
  extraction: {
    transcript_urdu: string;
    transcript_roman_urdu: string;
    english_summary: string;
    missing_information: string[];
  } | null;
};

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

type Incident = {
  id: string;
  status: string;
  incident_type: string;
  summary: string | null;
  created_at: number;
  assigned_to: string | null;
  district: string | null;
  assigned_at: number | null;
  assigned_by: string | null;
  lat: number | null;
  lon: number | null;
  urgency: { indicator: string; sources: number }[];
  vulnerable: string[];
  resources: string[];
  people_claims: { value: number; sources: number }[];
  conflicts: { field: string; values: string[]; sources: number }[];
  quality: {
    locationQuality: "gps" | "landmark" | "missing";
    completeness: { present: number; total: number };
    distinctReports: number;
    citizenConfirmed: number;
    unresolvedConflicts: number;
  };
  locations: string[];
  signal: number;
  audit: { at: number; actor: string; action: string; detail: string | null }[];
  reports: Report[];
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-critical/15 text-red-300 ring-critical/40",
  verified: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  assigned: "bg-blue-500/15 text-blue-300 ring-blue-500/40",
  responding: "bg-teal-500/15 text-teal-300 ring-teal-500/40",
  resolved: "bg-slate-500/15 text-slate-400 ring-slate-500/40",
};

/**
 * Offer the next steps forward in the flow, plus resolve. Offering "mark new" on an
 * assigned incident invites an accidental regression of live operational state.
 */
function nextStatuses(current: string): string[] {
  const i = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
  if (i === -1) return ["verified"];
  const forward = STATUS_FLOW.slice(i + 1, i + 2);
  const out = [...forward];
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
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // undefined while localStorage is being read, null when setup is needed.
  const [identity, setIdentity] = useState<OpsIdentity | null | undefined>(undefined);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  // Setup guarantees a name before the board renders, so no action can be
  // unattributed and no guard has to refuse one. This previously failed at the
  // point of the click, in a banner far from the button that was pressed.
  const operator = identity?.operator ?? "";
  const [team, setTeam] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingDup[]>([]);

  const load = useCallback(async () => {
    try {
      const [incRes, dupRes] = await Promise.all([
        fetch("/api/incidents", { cache: "no-store" }),
        fetch("/api/duplicates", { cache: "no-store" }),
      ]);
      const j = await incRes.json();
      const d = await dupRes.json();
      setIncidents(j.incidents ?? []);
      setPending(d.pending ?? []);
      setErr(null);
    } catch {
      setErr("Could not load incidents. Retrying automatically.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<OpsIdentity>;
        if (parsed.operator && parsed.district) {
          setIdentity({
            operator: parsed.operator,
            district: parsed.district,
            organisation: parsed.organisation ?? "",
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

  /**
   * Change the responding team without moving the incident's status.
   *
   * The status flow can only attach a team at the moment of assignment, so once an
   * incident is responding there is no way to record that a different team took it
   * over. That happens constantly in a real operation, and an out-of-date team name
   * on the board is worse than none: it sends a dispatcher chasing the wrong radio.
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
      body: JSON.stringify({ team: next, operator: operator.trim() }),
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

  async function advance(inc: Incident, status: string) {
    // Assigning a team needs a team name, collected inline rather than in a native
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
        operator: operator.trim(),
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

  async function resolveDuplicate(reportId: string, body: Record<string, unknown>) {
    const res = await fetch("/api/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, operator: operator.trim(), ...body }),
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
   * This room's incidents.
   *
   * An incident the system could not place is shown to every room rather than
   * hidden from all of them. That is the safe failure: several control rooms
   * seeing one unplaced emergency costs a phone call, whereas none seeing it
   * costs far more.
   */
  const mine = incidents.filter(
    (i) => i.district === identity?.district || i.district === null,
  );
  const elsewhere = incidents.length - mine.length;

  if (identity === undefined) {
    return <main className="min-h-screen bg-ground" aria-busy="true" />;
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
    <main className="min-h-screen bg-ground text-paper">
      <header className="border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-brand-soft">
              AmanSignal <span className="font-normal text-paper-soft">Operations</span>
            </h1>
            <p className="text-xs text-paper-soft">
              The system highlights urgency indicators. You decide what is worked first.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-medium text-paper">{districtName(identity.district)} control room</p>
              <p className="text-xs text-paper-soft">
                {identity.operator}
                {identity.organisation ? ` · ${identity.organisation}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingIdentity(true)}
              className="rounded-lg px-3 py-2 text-paper-soft ring-1 ring-line transition-colors hover:text-paper"
            >
              Change
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {err ? (
          <p role="alert" className="mb-4 rounded-lg bg-critical/15 px-4 py-3 text-sm text-red-300 ring-1 ring-critical/40">
            {err}
          </p>
        ) : null}

        {mine.length ? (
          <IncidentMap
            incidents={mine}
            selectedId={open}
            onSelect={(id) => {
              setOpen(id);
              document.getElementById(`incident-${id}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }}
          />
        ) : null}

        {pending.length ? (
          <section className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-amber-300">
              Needs your judgement · {pending.length}
            </h2>
            <p className="mb-4 text-xs text-paper-soft">
              These reports resemble an existing incident, but not closely enough to link
              automatically. They are held rather than merged, because a wrong merge hides an
              emergency.
            </p>
            <ul className="space-y-3">
              {pending.map((p) => (
                <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="mb-1 text-sm">{p.summary ?? p.raw_text}</p>
                  <p className="mb-3 text-xs text-paper-soft">
                    {timeAgo(p.created_at)}
                    {p.people_affected !== null ? ` · ${p.people_affected} affected` : ""}
                    {p.locations.length ? ` · ${p.locations.join(", ")}` : " · no location given"}
                  </p>
                  <div className="space-y-2">
                    {p.candidates.map((c) => (
                      <div
                        key={c.incident_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{c.incident_summary}</p>
                          <p className="text-xs text-paper-soft">
                            similarity {c.similarity} ·{" "}
                            {c.geo_confirmed ? `${c.distance_m}m away` : "distance unknown"} ·{" "}
                            {c.method}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => resolveDuplicate(p.id, { link_to: c.incident_id })}
                          className="cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Same incident
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => resolveDuplicate(p.id, { separate: true })}
                      className="cursor-pointer rounded-lg bg-surface-2 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-surface"
                    >
                      This is a separate emergency
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {loading ? (
          <p className="text-paper-soft">Loading incidents...</p>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <p className="font-semibold">
              Nothing open in {districtName(identity.district)}
            </p>
            <p className="mt-1 text-sm text-paper-soft">
              Confirmed citizen reports from this district appear here as incidents.
            </p>
            {elsewhere > 0 ? (
              <p className="mt-3 text-sm text-paper-soft">
                {elsewhere} incident{elsewhere === 1 ? " is" : "s are"} open in other
                districts, handled by their own control rooms.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {elsewhere > 0 ? (
              <li className="px-1 text-xs text-paper-soft">
                Showing {mine.length} in {districtName(identity.district)}. {elsewhere}{" "}
                elsewhere {elsewhere === 1 ? "is" : "are"} handled by another control room.
              </li>
            ) : null}
            {mine.map((inc) => {
              const isOpen = open === inc.id;
              return (
                <li
                  key={inc.id}
                  id={`incident-${inc.id}`}
                  className={`rounded-2xl border bg-surface transition-colors ${
                    isOpen ? "border-brand-soft" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${STATUS_STYLE[inc.status] ?? ""}`}>
                          {inc.status}
                        </span>
                        <span className="text-xs text-paper-soft">
                          {LABEL[inc.incident_type] ?? inc.incident_type} · {timeAgo(inc.created_at)}
                        </span>
                        {inc.assigned_to ? (
                          <span className="text-xs text-blue-300">→ {inc.assigned_to}</span>
                        ) : null}
                      </div>

                      <p className="mb-3 text-[15px] leading-relaxed">{inc.summary}</p>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {inc.urgency.map((u) => (
                          <span
                            key={u.indicator}
                            className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30"
                          >
                            {LABEL[u.indicator] ?? u.indicator}
                            {u.sources > 1 ? <span className="ml-1 opacity-70">×{u.sources}</span> : null}
                          </span>
                        ))}
                        {inc.vulnerable.map((v) => (
                          <span key={v} className="rounded-md bg-surface-2 px-2 py-1 text-xs text-paper ring-1 ring-line">
                            {LABEL[v] ?? v}
                          </span>
                        ))}
                      </div>

                      {inc.conflicts.length ? (
                        <div className="mb-3 rounded-lg bg-critical/10 px-3 py-2 text-xs text-red-300 ring-1 ring-critical/30">
                          {inc.conflicts.map((c) => (
                            <div key={c.field}>
                              <strong>{c.field.replace("_", " ")} disputed</strong>: {c.values.join(" vs ")} ({c.sources} reports)
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-paper-soft">
                        <div>
                          <dt className="inline">Location: </dt>
                          {/* A dispatcher acts on the place, not on the word "gps". Landmarks
                              a citizen gave, including ones supplied when we asked, are shown
                              here rather than left buried in the evidence panel. */}
                          <dd className={`inline font-medium ${inc.quality.locationQuality === "missing" ? "text-red-300" : "text-paper"}`}>
                            {inc.quality.locationQuality}
                            {inc.locations.length ? ` · ${inc.locations.join(", ")}` : ""}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Completeness: </dt>
                          <dd className="inline font-medium text-paper">
                            {inc.quality.completeness.present}/{inc.quality.completeness.total}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Distinct reports: </dt>
                          <dd className="inline font-medium text-paper">{inc.quality.distinctReports}</dd>
                        </div>
                        <div>
                          <dt className="inline">Citizen-confirmed: </dt>
                          <dd className="inline font-medium text-paper">{inc.quality.citizenConfirmed}</dd>
                        </div>
                        {inc.people_claims.length ? (
                          <div>
                            <dt className="inline">People affected: </dt>
                            <dd className="inline font-medium text-paper">
                              {inc.people_claims.length === 1
                                ? inc.people_claims[0].value
                                : inc.people_claims
                                    .map((p) => `${p.value} (${p.sources} report${p.sources === 1 ? "" : "s"})`)
                                    .join(" / ")}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-44">
                      {nextStatuses(inc.status).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => advance(inc, s)}
                          className="cursor-pointer rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium capitalize ring-1 ring-line transition-colors hover:bg-brand hover:text-white"
                        >
                          Mark {s}
                        </button>
                      ))}
                      {inc.assigned_to && reassigning !== inc.id ? (
                        <button
                          type="button"
                          onClick={() => reassign(inc)}
                          className="cursor-pointer rounded-lg px-3 py-2 text-sm text-paper-soft ring-1 ring-line transition-colors hover:bg-surface-2"
                        >
                          Change team
                        </button>
                      ) : null}
                      {reassigning === inc.id ? (
                        <div className="rounded-lg bg-surface-2 p-2 ring-1 ring-brand-soft">
                          <label htmlFor={`reteam-${inc.id}`} className="mb-1 block text-xs text-paper-soft">
                            Hand over to which team?
                          </label>
                          <input
                            id={`reteam-${inc.id}`}
                            autoFocus
                            value={team[inc.id] ?? ""}
                            onChange={(e) => setTeam((t) => ({ ...t, [inc.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") reassign(inc);
                              if (e.key === "Escape") setReassigning(null);
                            }}
                            placeholder={inc.assigned_to ?? "e.g. Boat Team 3"}
                            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-paper outline-none focus:border-brand-soft"
                          />
                        </div>
                      ) : null}
                      {assigning === inc.id ? (
                        <div className="rounded-lg bg-surface-2 p-2 ring-1 ring-brand-soft">
                          <label htmlFor={`team-${inc.id}`} className="mb-1 block text-xs text-paper-soft">
                            Which team?
                          </label>
                          <input
                            id={`team-${inc.id}`}
                            autoFocus
                            value={team[inc.id] ?? ""}
                            onChange={(e) => setTeam((t) => ({ ...t, [inc.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && advance(inc, "assigned")}
                            placeholder="e.g. Boat Team 3"
                            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-paper outline-none focus:border-brand-soft"
                          />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : inc.id)}
                        className="cursor-pointer rounded-lg px-3 py-2 text-sm text-paper-soft underline-offset-2 hover:underline"
                      >
                        {isOpen ? "Hide evidence" : `Evidence (${inc.reports.length})`}
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="border-t border-line bg-ground/40 p-5">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-paper-soft">
                        Underlying reports
                      </h3>
                      <ul className="space-y-3">
                        {inc.reports.map((r) => (
                          <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-paper-soft">
                              <span>{timeAgo(r.created_at)}</span>
                              <span>{r.status}</span>
                              {r.has_audio ? <span className="text-teal-300">voice note</span> : null}
                              {r.has_image ? <span className="text-teal-300">photo</span> : null}
                              {r.pin_adjusted ? (
                                <span className="text-teal-300">pin placed by reporter</span>
                              ) : null}
                              {r.latency_ms ? <span>{r.latency_ms}ms · {r.model}</span> : null}
                            </div>
                            {/* Who to call. A dispatcher with a phone number can
                                settle in one call what a map cannot: whether the
                                water is still rising, whether they have moved. */}
                            {r.reporter_phone || r.reporter_name ? (
                              <p className="mb-2 text-sm">
                                <span className="text-paper-soft">Reporter: </span>
                                <span className="text-paper">{r.reporter_name || "not given"}</span>
                                {r.reporter_phone ? (
                                  <a
                                    href={`tel:${r.reporter_phone}`}
                                    className="ml-2 rounded-md bg-brand/20 px-2 py-1 font-medium text-brand-soft hover:underline"
                                  >
                                    {r.reporter_phone}
                                  </a>
                                ) : null}
                              </p>
                            ) : null}
                            {r.raw_text ? (
                              <p className="mb-2 text-sm text-paper" dir="auto">{r.raw_text}</p>
                            ) : null}
                            {r.extraction?.transcript_urdu ? (
                              <p className="urdu mb-2 text-sm text-paper">{r.extraction.transcript_urdu}</p>
                            ) : null}
                            {r.clarifications?.length ? (
                              <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs">
                                {r.clarifications.map((c, i) => (
                                  <div key={i}>
                                    <span className="text-paper-soft">Asked: {c.question} </span>
                                    <span className="text-paper">→ {c.answer}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {r.extraction?.missing_information?.length ? (
                              <p className="text-xs text-amber-300">
                                Still unknown: {r.extraction.missing_information.join("; ")}
                              </p>
                            ) : null}
                            {r.repairs?.length ? (
                              <p className="mt-1 text-xs text-paper-soft">
                                Schema repairs: {r.repairs.join("; ")}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-paper-soft">
                        Audit trail
                      </h3>
                      <ul className="space-y-1 text-xs text-paper-soft">
                        {inc.audit.map((a, i) => (
                          <li key={i}>
                            <span className={a.actor === "ai" ? "text-amber-300" : "text-teal-300"}>{a.actor}</span>
                            {" · "}
                            {a.action}
                            {a.detail ? ` · ${a.detail}` : ""}
                            {" · "}
                            {timeAgo(a.at)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
