"use client";

import { useEffect, useRef, useState } from "react";
import type { Incident, EditPatch } from "./types";
import type { OpsStrings } from "@/lib/i18n-ops";
import { labelFor, URGENCY, VULNERABLE, ROAD, type Lang } from "@/lib/i18n";
import { URGENCY_INDICATORS, VULNERABLE_GROUPS, ROAD_ACCESS } from "@/lib/schema";

/**
 * Everything about one incident, on demand.
 *
 * The board card carries only what decides whether to act; all the rest lives
 * here. That split exists because the two jobs are different: a dispatcher
 * scanning twenty incidents needs to find the next one to work, and a dispatcher
 * who has found it needs the evidence. Putting both on the card meant neither
 * was served, and a screen of eight-line cards is unscannable.
 *
 * The edit form corrects the INTERPRETATION. The reports below it are evidence
 * and are read-only here by design: a citizen said what they said, and an
 * operator judging the model misread it does not change what was said. Clearing
 * a correction restores the derived values exactly.
 */
export default function IncidentDetail({
  incident,
  t,
  lang,
  operator,
  onClose,
  onSaved,
}: {
  incident: Incident;
  t: OpsStrings;
  lang: Lang;
  operator: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Answering the reporter, which is a different act from editing the incident:
  // one changes what we believe, the other changes what they know.
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Kept entirely separate from the reporter's box. Same act, different
  // audience, and the two must not be one keystroke apart.
  const [crewMessage, setCrewMessage] = useState("");
  const [sendingCrew, setSendingCrew] = useState(false);
  const [sentCrew, setSentCrew] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  const [summary, setSummary] = useState(incident.summary ?? "");
  const [urgency, setUrgency] = useState<string[]>(incident.urgency.map((u) => u.indicator));
  const [vulnerable, setVulnerable] = useState<string[]>(incident.vulnerable);
  const [people, setPeople] = useState<string>(
    incident.people_claims.length === 1 ? String(incident.people_claims[0].value) : "",
  );
  const [road, setRoad] = useState<string>(
    incident.conflicts.some((c) => c.field === "road_access") ? "" : "",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const patch: EditPatch = {
      summary: summary.trim() || undefined,
      urgency_indicators: urgency,
      vulnerable_people: vulnerable,
      people_affected: people.trim() === "" ? null : Number(people),
    };
    if (road) patch.road_access = road;
    try {
      const res = await fetch(`/api/incidents/${incident.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Could not save.");
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    setSaving(true);
    try {
      await fetch(`/api/incidents/${incident.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operator, clear: true }),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const when = (ms: number) => new Date(ms).toLocaleString();

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        dir={t.dir}
        className="ops-surface w-full max-w-3xl rounded-2xl border border-line bg-ground shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-paper-soft">
              {incident.incident_type.replace(/_/g, " ")} &middot; {when(incident.created_at)}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-paper">
              {incident.summary ?? "(no summary)"}
            </h2>
            {incident.corrected ? (
              <p className="mt-1 text-xs text-warn">
                {t.editIncident}: {incident.corrected.fields.join(", ")} &middot;{" "}
                {incident.corrected.by.replace(/^operator:/, "")}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`${t.face} rounded-lg bg-surface-2 px-3 py-2 text-sm ring-1 ring-line`}
              >
                {t.editIncident}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.closeDetails}
              className="rounded-lg px-3 py-2 text-sm text-paper-soft ring-1 ring-line"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5">
          {editing ? (
            <section className="rounded-xl border border-brand-soft/40 bg-surface p-4">
              <p className={`${t.face} mb-4 text-xs text-paper-soft`}>{t.editedNote}</p>

              <label className={`${t.face} block text-sm font-medium text-paper`}>{t.summary}</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                dir="auto"
                className="mt-1 w-full rounded-lg border border-line bg-ground p-3 text-sm text-paper outline-none focus:border-brand-soft"
              />

              <p className={`${t.face} mt-4 text-sm font-medium text-paper`}>{t.situation}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {URGENCY_INDICATORS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={urgency.includes(u)}
                    onClick={() => setUrgency((l) => toggle(l, u))}
                    className={`${t.face} rounded-lg px-3 py-1.5 text-sm ring-1 ${
                      urgency.includes(u)
                        ? "bg-warn/20 text-warn ring-warn/50"
                        : "bg-ground text-paper-soft ring-line"
                    }`}
                  >
                    {labelFor(URGENCY, u, lang)}
                  </button>
                ))}
              </div>

              <p className={`${t.face} mt-4 text-sm font-medium text-paper`}>{t.vulnerable}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {VULNERABLE_GROUPS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={vulnerable.includes(v)}
                    onClick={() => setVulnerable((l) => toggle(l, v))}
                    className={`${t.face} rounded-lg px-3 py-1.5 text-sm ring-1 ${
                      vulnerable.includes(v)
                        ? "bg-surface-2 text-paper ring-line"
                        : "bg-ground text-paper-soft ring-line"
                    }`}
                  >
                    {labelFor(VULNERABLE, v, lang)}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <label htmlFor="ppl" className={`${t.face} block text-sm font-medium text-paper`}>
                    {t.peopleAffected}
                  </label>
                  <input
                    id="ppl"
                    type="number"
                    min={0}
                    dir="ltr"
                    value={people}
                    onChange={(e) => setPeople(e.target.value)}
                    className="mt-1 w-24 rounded-lg border border-line bg-ground px-3 py-2 text-paper outline-none focus:border-brand-soft"
                  />
                </div>
                <div>
                  <p className={`${t.face} text-sm font-medium text-paper`}>{t.roadAccess}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {ROAD_ACCESS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={road === r}
                        onClick={() => setRoad(road === r ? "" : r)}
                        className={`${t.face} rounded-lg px-3 py-1.5 text-sm ring-1 ${
                          road === r ? "bg-brand text-white ring-brand" : "bg-ground text-paper-soft ring-line"
                        }`}
                      >
                        {labelFor(ROAD, r, lang)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {err ? <p className="mt-3 text-sm text-red-300">{err}</p> : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className={`${t.face} rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50`}
                >
                  {t.saveChanges}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={`${t.face} rounded-lg px-5 py-2.5 text-sm text-paper-soft ring-1 ring-line`}
                >
                  {t.cancel}
                </button>
                {incident.corrected ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={revert}
                    className={`${t.face} rounded-lg px-5 py-2.5 text-sm text-warn ring-1 ring-warn/40 disabled:opacity-50`}
                  >
                    ↺
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {incident.conflicts.length ? (
            <section>
              <p className={`${t.face} mb-2 text-xs uppercase tracking-wide text-paper-soft`}>
                {t.disputed}
              </p>
              {incident.conflicts.map((c) => (
                <div
                  key={c.field}
                  className="mb-2 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-red-300"
                >
                  <strong>{c.field.replace(/_/g, " ")}</strong>: {c.values.join(" vs ")} ({c.sources})
                </div>
              ))}
            </section>
          ) : null}

          <section>
            <p className={`${t.face} mb-2 text-xs uppercase tracking-wide text-paper-soft`}>
              {t.underlyingReports} ({incident.reports.length})
            </p>
            {incident.reports.length === 0 ? (
              <p className={`${t.face} text-sm text-paper-soft`}>{t.noReportsYet}</p>
            ) : null}
            <ul className="space-y-3">
              {incident.reports.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-paper-soft">
                    <span>{when(r.created_at)}</span>
                    <span>{r.status}</span>
                    {r.has_audio ? <span className="text-brand-soft">{t.voiceNote}</span> : null}
                    {r.has_image ? <span className="text-brand-soft">{t.photo}</span> : null}
                    {r.pin_adjusted ? (
                      <span className="text-brand-soft">{t.pinPlacedByReporter}</span>
                    ) : null}
                    {r.citizen_safe ? <span className="text-ok">{t.reporterSaysSafe}</span> : null}
                    {/* Said plainly: this reporter never saw the confirmation
                        screen, so the extraction below carries the model's word
                        alone and should be weighed accordingly. */}
                    {r.queued_offline ? (
                      <span className="text-warn">{t.sentFromOutbox}</span>
                    ) : null}
                    {r.latency_ms ? <span className="mono">{r.latency_ms}ms &middot; {r.model}</span> : null}
                  </div>

                  {r.reporter_name || r.reporter_phone ? (
                    <p className="mb-2 text-sm">
                      <span className={`${t.face} text-paper-soft`}>{t.reporter}: </span>
                      <span className="text-paper">{r.reporter_name || t.notGiven}</span>
                      {r.reporter_phone ? (
                        <a
                          href={`tel:${r.reporter_phone}`}
                          dir="ltr"
                          className="mono ms-2 rounded-md bg-brand/20 px-2 py-1 text-brand-soft"
                        >
                          {r.reporter_phone}
                        </a>
                      ) : null}
                    </p>
                  ) : null}

                  {/* The evidence itself, not a description of it. A transcript
                      sits about 12% word error rate away from what was said, and
                      an operator deciding whether to send a boat should be able
                      to hear the difference. */}
                  {r.has_audio ? (
                    <audio
                      controls
                      preload="none"
                      src={`/api/media/${r.id}?kind=audio`}
                      className="mb-2 w-full"
                    />
                  ) : null}

                  {r.has_image ? (
                    <a
                      href={`/api/media/${r.id}?kind=image`}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-2 block"
                    >
                      {/* Deliberately an <img>, not next/image: this is a
                          user-uploaded file served from our own API, not a build
                          time asset the optimiser knows the dimensions of. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/media/${r.id}?kind=image`}
                        alt="Photo attached to this report"
                        loading="lazy"
                        className="max-h-64 rounded-lg border border-line object-contain"
                      />
                    </a>
                  ) : null}

                  {r.raw_text ? (
                    <p className="mb-2 text-sm text-paper" dir="auto">
                      {r.raw_text}
                    </p>
                  ) : null}
                  {r.extraction?.transcript_urdu ? (
                    <p className="urdu mb-2 text-sm text-paper">{r.extraction.transcript_urdu}</p>
                  ) : null}

                  {r.clarifications?.length ? (
                    <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs">
                      {r.clarifications.map((c, i) => (
                        <div key={i}>
                          <span className="text-paper-soft">
                            {t.asked}: {c.question}{" "}
                          </span>
                          <span className="text-paper">&rarr; {c.answer}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {r.extraction?.missing_information?.length ? (
                    <p className="text-xs text-warn">
                      {t.stillUnknown}: {r.extraction.missing_information.join("; ")}
                    </p>
                  ) : null}
                  {r.repairs?.length ? (
                    <p className="mt-1 text-xs text-paper-soft">
                      {t.repairs}: {r.repairs.join("; ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {/* Closing the loop back to the person who reported it. Placed above
              the audit trail because it is a thing to do, not a thing to read. */}
          <section>
            <p className={`${t.face} mb-1 text-xs uppercase tracking-wide text-paper-soft`}>
              {t.messageReporter}
            </p>
            <p className={`${t.face} mb-3 text-xs leading-relaxed text-paper-soft`}>
              {t.messageReporterWhy}
            </p>

            {incident.messages.filter((m) => !m.to_team).length ? (
              <ul className="mb-3 space-y-2">
                {incident.messages
                  .filter((m) => !m.to_team)
                  .map((m, i) => (
                  <li key={i} className="rounded-lg bg-surface-2 p-3">
                    <p className="text-sm text-paper" dir="auto">
                      {m.body}
                    </p>
                    <p className="mono mt-1 text-xs text-paper-soft">
                      {m.actor} &middot; {when(m.at)} &middot;{" "}
                      <span className={m.seen ? "text-ok" : "text-paper-soft"}>
                        {m.seen ? t.seenByReporter : t.notSeenYet}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setSent(false);
              }}
              rows={2}
              dir="auto"
              placeholder={t.messagePlaceholder}
              className="w-full rounded-lg border border-line bg-surface-2 p-2 text-sm text-paper"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={sending || !message.trim()}
                onClick={async () => {
                  setSending(true);
                  setErr(null);
                  try {
                    const res = await fetch(`/api/incidents/${incident.id}/message`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ operator, body: message.trim() }),
                    });
                    if (res.ok) {
                      setMessage("");
                      setSent(true);
                      onSaved();
                    } else {
                      const j = await res.json().catch(() => ({}));
                      // A message with no reachable reporter is reported as a
                      // failure, because an operator who believes they have
                      // answered someone will not try another way.
                      setErr(res.status === 409 ? t.noReporterToMessage : (j.error ?? "failed"));
                    }
                  } catch {
                    setErr("Could not reach the server.");
                  } finally {
                    setSending(false);
                  }
                }}
                className={`${t.face} cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {t.sendMessage}
              </button>
              {sent ? <span className={`${t.face} text-sm text-ok`}>{t.messageSent}</span> : null}
            </div>
          </section>

          {incident.assigned_to ? (
            <section>
              <p className={`${t.face} mb-1 text-xs uppercase tracking-wide text-paper-soft`}>
                {t.tellCrew} &middot; {incident.assigned_to}
              </p>
              <p className={`${t.face} mb-3 text-xs leading-relaxed text-paper-soft`}>
                {t.tellCrewWhy}
              </p>

              {incident.messages.filter((m) => m.to_team).length ? (
                <ul className="mb-3 space-y-2">
                  {incident.messages
                    .filter((m) => m.to_team)
                    .map((m, i) => (
                      <li key={i} className="rounded-lg bg-surface-2 p-3">
                        <p className="text-sm text-paper" dir="auto">
                          {m.body}
                        </p>
                        <p className="mono mt-1 text-xs text-paper-soft">
                          {m.actor} &middot; {when(m.at)} &middot;{" "}
                          <span className={m.seen ? "text-ok" : "text-paper-soft"}>
                            {m.seen ? t.seenByReporter : t.notSeenYet}
                          </span>
                        </p>
                      </li>
                    ))}
                </ul>
              ) : null}

              <textarea
                value={crewMessage}
                onChange={(e) => {
                  setCrewMessage(e.target.value);
                  setSentCrew(false);
                }}
                rows={2}
                dir="auto"
                placeholder={t.crewPlaceholder}
                className="w-full rounded-lg border border-line bg-surface-2 p-2 text-sm text-paper"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={sendingCrew || !crewMessage.trim()}
                  onClick={async () => {
                    setSendingCrew(true);
                    setErr(null);
                    try {
                      const res = await fetch(`/api/incidents/${incident.id}/message`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ operator, body: crewMessage.trim(), to: "team" }),
                      });
                      if (res.ok) {
                        setCrewMessage("");
                        setSentCrew(true);
                        onSaved();
                      } else {
                        const j = await res.json().catch(() => ({}));
                        setErr(j.error ?? "failed");
                      }
                    } catch {
                      setErr("Could not reach the server.");
                    } finally {
                      setSendingCrew(false);
                    }
                  }}
                  className={`${t.face} cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {t.sendMessage}
                </button>
                {sentCrew ? (
                  <span className={`${t.face} text-sm text-ok`}>{t.messageSent}</span>
                ) : null}
              </div>
            </section>
          ) : null}

          <section>
            <p className={`${t.face} mb-2 text-xs uppercase tracking-wide text-paper-soft`}>
              {t.auditTrail}
            </p>
            <div className="mono space-y-1 text-xs text-paper-soft">
              {incident.audit.map((a, i) => (
                <div key={i}>
                  <span
                    className={
                      a.actor === "ai"
                        ? "text-info"
                        : a.actor === "citizen"
                          ? "text-brand-soft"
                          : "text-warn"
                    }
                  >
                    {a.actor}
                  </span>{" "}
                  &middot; {a.action}
                  {a.detail ? ` · ${a.detail}` : ""} &middot; {when(a.at)}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
