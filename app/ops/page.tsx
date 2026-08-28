"use client";

import { useEffect, useState, useCallback } from "react";
import { LABEL, STATUS_FLOW } from "@/lib/incident";

type Report = {
  id: string;
  created_at: number;
  status: string;
  raw_text: string | null;
  has_audio: boolean;
  has_image: boolean;
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

type Incident = {
  id: string;
  status: string;
  incident_type: string;
  summary: string | null;
  created_at: number;
  assigned_to: string | null;
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

export default function OpsBoard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [operator, setOperator] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [team, setTeam] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents", { cache: "no-store" });
      const j = await res.json();
      setIncidents(j.incidents ?? []);
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
    setOperator(localStorage.getItem("amansignal.operator") ?? "");
  }, []);

  async function advance(inc: Incident, status: string) {
    if (!operator.trim()) {
      setErr("Enter your name first: every status change is recorded against a person.");
      return;
    }
    // Assigning a team needs a team name, collected inline rather than in a native
    // dialog: it must be styleable, testable, and must not block the tab.
    if (status === "assigned" && !(team[inc.id] ?? "").trim()) {
      setAssigning(inc.id);
      setErr(null);
      return;
    }
    localStorage.setItem("amansignal.operator", operator.trim());
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
          <label className="flex items-center gap-2 text-sm">
            <span className="text-paper-soft">Operator</span>
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="your name"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-paper outline-none focus:border-brand-soft"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {err ? (
          <p role="alert" className="mb-4 rounded-lg bg-critical/15 px-4 py-3 text-sm text-red-300 ring-1 ring-critical/40">
            {err}
          </p>
        ) : null}

        {loading ? (
          <p className="text-paper-soft">Loading incidents...</p>
        ) : incidents.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center">
            <p className="font-semibold">No incidents yet</p>
            <p className="mt-1 text-sm text-paper-soft">
              Confirmed citizen reports appear here as incidents.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {incidents.map((inc) => {
              const isOpen = open === inc.id;
              return (
                <li key={inc.id} className="rounded-2xl border border-line bg-surface">
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
                          <dd className={`inline font-medium ${inc.quality.locationQuality === "missing" ? "text-red-300" : "text-paper"}`}>
                            {inc.quality.locationQuality}
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
                              {inc.people_claims.map((p) => `${p.value} (${p.sources})`).join(" / ")}
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
                              {r.latency_ms ? <span>{r.latency_ms}ms · {r.model}</span> : null}
                            </div>
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
