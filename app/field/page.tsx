"use client";

import { useCallback, useEffect, useState } from "react";
import { fieldStringsFor } from "@/lib/i18n-field";
import { labelFor, URGENCY, VULNERABLE, ROAD, type Lang } from "@/lib/i18n";

/**
 * What a crew sees after a control room hands them an incident.
 *
 * This screen exists because until now the dispatch loop was open: an operator
 * could mark an incident "assigned to Boat Team 3" and Boat Team 3 would never
 * learn of it from this system. The status was true inside the database and
 * false in the world.
 *
 * Built for one hand outdoors. One incident per card, the address and the phone
 * number reachable without scrolling, and the two actions a crew actually takes
 * as buttons big enough to hit while standing in a boat. It polls rather than
 * asking anyone to refresh, because nobody refreshes a page while carrying
 * someone.
 */

type Incident = {
  id: string;
  status: string;
  summary: string | null;
  created_at: number;
  updated_at: number;
  assigned_at: number | null;
  assigned_by: string | null;
  lat: number | null;
  lon: number | null;
  district: string | null;
  locations: string[];
  urgency: { indicator: string; sources: number }[];
  vulnerable: string[];
  people_claims: { value: number; sources: number }[];
  road_access: { value: string | null; disputed: string[] | null };
  contacts: { name: string | null; phone: string | null }[];
  said: { at: number; text: string | null }[];
  evidence: { report_id: string; has_audio: boolean; has_image: boolean }[];
  told: { at: number; body: string }[];
  orders: { at: number; body: string; actor: string; seen: boolean }[];
};

const TEAM_KEY = "amansignal.field.team";
const LANG_KEY = "amansignal.field.lang";

function timeAgo(ts: number, lang: Lang) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (lang === "ur") {
    if (mins < 1) return "ابھی";
    if (mins < 60) return `${mins} منٹ پہلے`;
    return `${Math.round(mins / 60)} گھنٹے پہلے`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function FieldBoard() {
  const [team, setTeam] = useState<string | null | undefined>(undefined);
  const [lang, setLang] = useState<Lang>("ur");
  const [teams, setTeams] = useState<string[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; ok: boolean } | null>(null);

  const t = fieldStringsFor(lang);

  useEffect(() => {
    try {
      setTeam(localStorage.getItem(TEAM_KEY));
      const l = localStorage.getItem(LANG_KEY);
      if (l === "en" || l === "ur") setLang(l);
    } catch {
      setTeam(null);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const url = team ? `/api/field?team=${encodeURIComponent(team)}` : "/api/field";
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = "/field/login";
        return;
      }
      const json = await res.json();
      setTeams(json.teams ?? []);
      setIncidents(json.incidents ?? []);

      /**
       * Acknowledge orders once they are on screen, not when the list refreshes.
       *
       * This polls every twenty seconds. Marking seen inside the fetch would
       * tell a control room a crew had read an instruction that nobody looked
       * at, which is worse for them than not knowing.
       */
      for (const inc of json.incidents ?? []) {
        if ((inc.orders ?? []).some((o: { seen: boolean }) => !o.seen)) {
          fetch(`/api/field/${inc.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ team, seen: true }),
          }).catch(() => {});
        }
      }
    } catch {
      // Left as it was. A crew mid-response should keep the last known list on
      // screen rather than have it replaced by an error they cannot act on.
    }
  }, [team]);

  useEffect(() => {
    if (team === undefined) return;
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [team, load]);

  function chooseTeam(name: string) {
    try {
      localStorage.setItem(TEAM_KEY, name);
    } catch {
      /* a crew with storage disabled still gets this session */
    }
    setTeam(name);
  }

  function chooseLang(l: Lang) {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* nothing to do */
    }
    setLang(l);
  }

  async function update(id: string, patch: { status?: string; note?: string }) {
    if (!team) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/field/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, ...patch }),
      });
      setFlash({ id, ok: res.ok });
      if (res.ok && patch.note) setNotes((n) => ({ ...n, [id]: "" }));
      await load();
    } catch {
      setFlash({ id, ok: false });
    } finally {
      setBusy(null);
      setTimeout(() => setFlash(null), 4000);
    }
  }

  if (team === undefined) {
    return <main className="ops-surface min-h-screen bg-ground" aria-busy="true" />;
  }

  const langToggle = (
    <div dir="ltr" className="flex rounded-lg bg-surface p-1 ring-1 ring-line">
      {(["ur", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => chooseLang(l)}
          className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${
            lang === l ? "bg-brand font-semibold text-white" : "text-paper-soft"
          } ${l === "ur" ? "urdu-ui" : ""}`}
        >
          {l === "ur" ? "اردو" : "English"}
        </button>
      ))}
    </div>
  );

  // ---------- choosing a crew ----------
  if (!team) {
    return (
      <main dir={t.dir} className="ops-surface min-h-screen bg-ground px-5 py-6 text-paper">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h1 className={`${t.face} text-lg font-semibold`}>{t.fieldTeam}</h1>
            {langToggle}
          </div>

          <h2 className={`${t.face} text-base font-semibold`}>{t.whichTeam}</h2>
          <p className={`${t.face} mt-1 text-sm leading-relaxed text-paper-soft`}>
            {t.whichTeamWhy}
          </p>

          {teams.length ? (
            <ul className="mt-5 space-y-2">
              {teams.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => chooseTeam(name)}
                    className={`${t.face} w-full cursor-pointer rounded-xl bg-surface px-4 py-4 text-start text-base ring-1 ring-line`}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 rounded-xl bg-surface p-5 ring-1 ring-line">
              <p className={`${t.face} text-sm text-paper`}>{t.noTeamsYet}</p>
              <p className={`${t.face} mt-1 text-sm text-paper-soft`}>{t.noTeamsYetWhy}</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ---------- the crew's work ----------
  return (
    <main dir={t.dir} className="ops-surface min-h-screen bg-ground px-5 py-6 text-paper">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className={`${t.face} text-lg font-semibold`}>{team}</h1>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(TEAM_KEY);
                } catch {
                  /* nothing to do */
                }
                setTeam(null);
              }}
              className={`${t.face} cursor-pointer text-xs text-paper-soft underline`}
            >
              {t.change}
            </button>
          </div>
          {langToggle}
        </div>

        {incidents.length === 0 ? (
          <div className="rounded-2xl bg-surface p-6 text-center ring-1 ring-line">
            <p className={`${t.face} text-base text-paper`}>{t.nothingAssigned}</p>
            <p className={`${t.face} mt-1 text-sm text-paper-soft`}>{t.nothingAssignedWhy}</p>
          </div>
        ) : (
          <>
            <p className={`${t.face} mb-3 text-xs text-paper-soft`}>
              {t.assignedCount(incidents.length)}
            </p>
            <ul className="space-y-4">
              {incidents.map((inc) => {
                const people = inc.people_claims[0]?.value ?? null;
                const status =
                  inc.status === "responding"
                    ? t.statusResponding
                    : inc.status === "resolved"
                      ? t.statusResolved
                      : t.statusAssigned;

                return (
                  <li
                    key={inc.id}
                    className={`rounded-2xl bg-surface p-5 ring-1 ${
                      inc.status === "resolved" ? "opacity-60 ring-line" : "ring-line"
                    }`}
                  >
                    {/* Above everything, because an instruction from the room
                        outranks the report it is about: it is the most recent
                        thing anyone knows and it may change where they go. */}
                    {inc.orders.length ? (
                      <div className="mb-3 rounded-lg bg-brand/15 p-3 ring-1 ring-brand/40">
                        <p className={`${t.face} text-xs font-semibold text-brand-soft`}>
                          {t.ordersFromRoom}
                        </p>
                        {inc.orders.map((o, i) => (
                          <p key={i} className={`${t.face} mt-1 text-base text-paper`} dir="auto">
                            {o.body}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <span className={`${t.face} text-xs font-semibold text-brand`}>{status}</span>
                      <span className="mono text-xs text-paper-soft">
                        {inc.assigned_at ? `${t.assignedAt} ${timeAgo(inc.assigned_at, lang)}` : ""}
                      </span>
                    </div>

                    {/*
                      In Urdu, the reporters' own words lead.

                      The incident summary is produced by the extraction schema
                      in English, which is right for a control room and useless
                      to an Urdu-speaking crew: it is the one place in this app
                      where the person doing the work could not read the most
                      important line on their own screen. Their words are shown
                      instead, which is also the more trustworthy text, and the
                      English synthesis is kept underneath rather than dropped.
                    */}
                    {lang === "ur" && inc.said.length ? (
                      <>
                        <div className="mt-2 space-y-2">
                          {inc.said.map((sd, i) => (
                            <p
                              key={i}
                              // text-start with dir="auto" so a Roman Urdu or
                              // English report inside an RTL page aligns to its
                              // own direction instead of inheriting the page's
                              // and stranding its full stop on the wrong side.
                              className={`${t.face} text-start text-base leading-relaxed text-paper`}
                              dir="auto"
                            >
                              {sd.text}
                            </p>
                          ))}
                        </div>
                        {inc.summary ? (
                          <p
                            className="mt-3 text-start text-sm leading-relaxed text-paper-soft"
                            dir="ltr"
                          >
                            {inc.summary}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p
                        className={`${t.face} mt-2 text-start text-base leading-relaxed text-paper`}
                        dir="auto"
                      >
                        {inc.summary ?? ""}
                      </p>
                    )}

                    {/* What decides the vehicle, the crew size and the kit. */}
                    <dl className="mt-4 space-y-2 text-sm">
                      {inc.urgency.length ? (
                        <div className="flex flex-wrap gap-2">
                          {inc.urgency.map((u) => (
                            <span
                              key={u.indicator}
                              className={`${t.face} rounded-lg bg-critical/15 px-2.5 py-1 text-xs text-red-200 ring-1 ring-critical/40`}
                            >
                              {labelFor(URGENCY, u.indicator, lang)}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {people !== null ? (
                        <div className="flex justify-between gap-3">
                          <dt className={`${t.face} text-paper-soft`}>{t.peopleThere}</dt>
                          <dd className="text-paper">{people}</dd>
                        </div>
                      ) : null}

                      {inc.vulnerable.length ? (
                        <div className="flex justify-between gap-3">
                          <dt className={`${t.face} text-paper-soft`}>{t.vulnerable}</dt>
                          <dd className={`${t.face} text-end text-paper`}>
                            {inc.vulnerable.map((v) => labelFor(VULNERABLE, v, lang)).join("، ")}
                          </dd>
                        </div>
                      ) : null}

                      <div className="flex justify-between gap-3">
                        <dt className={`${t.face} text-paper-soft`}>{t.roadAccess}</dt>
                        <dd className={`${t.face} text-end`}>
                          {inc.road_access.disputed ? (
                            <span className="text-warn">{t.roadDisputed}</span>
                          ) : (
                            <span className="text-paper">
                              {labelFor(ROAD, inc.road_access.value ?? "unknown", lang)}
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    {/* Getting there, and reaching them before you do. */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {inc.lat !== null && inc.lon !== null ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${inc.lat},${inc.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`${t.face} rounded-lg bg-surface-2 px-4 py-3 text-sm ring-1 ring-line`}
                        >
                          {t.openInMaps}
                        </a>
                      ) : (
                        <span className={`${t.face} text-xs text-warn`}>{t.noLocation}</span>
                      )}
                      {inc.contacts
                        .filter((c) => c.phone)
                        .map((c) => (
                          <a
                            key={c.phone}
                            href={`tel:${c.phone}`}
                            className={`${t.face} rounded-lg bg-surface-2 px-4 py-3 text-sm ring-1 ring-line`}
                          >
                            {t.callThem} {c.name ? `· ${c.name}` : ""}
                          </a>
                        ))}
                    </div>

                    {/* The evidence itself. A crew about to choose a vehicle can
                        read a photograph of the water line faster than any
                        field derived from it. Audio is not preloaded: this
                        screen is opened on mobile data at the edge of a flood. */}
                    {inc.evidence.length ? (
                      <div className="mt-4 space-y-3">
                        {inc.evidence.map((e) => (
                          <div key={e.report_id}>
                            {e.has_image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={`/api/media/${e.report_id}?kind=image&team=${encodeURIComponent(team)}`}
                                alt=""
                                className="w-full rounded-lg border border-line"
                              />
                            ) : null}
                            {e.has_audio ? (
                              <audio
                                controls
                                preload="none"
                                src={`/api/media/${e.report_id}?kind=audio&team=${encodeURIComponent(team)}`}
                                className="mt-2 w-full"
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {inc.locations.length ? (
                      <p className={`${t.face} mt-2 text-xs text-paper-soft`} dir="auto">
                        {inc.locations.join(" · ")}
                      </p>
                    ) : null}

                    {inc.said.length && lang !== "ur" ? (
                      <details className="mt-4">
                        <summary className={`${t.face} cursor-pointer text-xs text-paper-soft`}>
                          {t.whatTheySaid}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {inc.said.map((s, i) => (
                            <li key={i} className="text-sm text-paper" dir="auto">
                              {s.text}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    {inc.told.length ? (
                      <div className="mt-3 rounded-lg bg-surface-2 p-3">
                        <p className={`${t.face} text-xs text-paper-soft`}>{t.whatWeTold}</p>
                        {inc.told.map((m, i) => (
                          <p key={i} className="mt-1 text-sm text-paper" dir="auto">
                            {m.body}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {/* The two things a crew reports, and the one thing they write. */}
                    {inc.status !== "resolved" ? (
                      <div className="mt-5 space-y-3">
                        <div className="flex gap-2">
                          {inc.status !== "responding" ? (
                            <button
                              type="button"
                              disabled={busy === inc.id}
                              onClick={() => update(inc.id, { status: "responding" })}
                              className={`${t.face} flex-1 cursor-pointer rounded-xl bg-brand px-4 py-4 text-base font-semibold text-white disabled:opacity-40`}
                            >
                              {t.onOurWay}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy === inc.id}
                            onClick={() => update(inc.id, { status: "resolved" })}
                            className={`${t.face} flex-1 cursor-pointer rounded-xl bg-surface-2 px-4 py-4 text-base ring-1 ring-line disabled:opacity-40`}
                          >
                            {t.markDone}
                          </button>
                        </div>

                        <div>
                          <label className={`${t.face} block text-xs text-paper-soft`}>
                            {t.reportBack}
                          </label>
                          <p className={`${t.face} mt-0.5 text-xs text-paper-soft`}>
                            {t.reportBackHint}
                          </p>
                          <textarea
                            value={notes[inc.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [inc.id]: e.target.value }))}
                            rows={3}
                            dir="auto"
                            className="mt-2 w-full rounded-lg border border-line bg-surface-2 p-3 text-base text-paper"
                          />
                          <button
                            type="button"
                            disabled={busy === inc.id || !(notes[inc.id] ?? "").trim()}
                            onClick={() => update(inc.id, { note: (notes[inc.id] ?? "").trim() })}
                            className={`${t.face} mt-2 w-full cursor-pointer rounded-xl bg-surface-2 px-4 py-3 text-sm ring-1 ring-line disabled:opacity-40`}
                          >
                            {busy === inc.id ? t.sending : t.send}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {flash?.id === inc.id ? (
                      <p
                        role="status"
                        className={`${t.face} mt-3 text-sm ${flash.ok ? "text-ok" : "text-warn"}`}
                      >
                        {flash.ok ? t.saved : t.failed}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
