"use client";

import { useMemo, useState } from "react";
import { DISTRICTS } from "@/lib/districts";

export type OpsIdentity = {
  operator: string;
  district: string;
  organisation: string;
};

/**
 * Who is at this desk, and which district they are running.
 *
 * The board previously opened straight onto every incident in the country with an
 * empty name box in the corner. Both are wrong for how relief actually works. A
 * control room runs one district, cannot task a boat in another province, and is
 * hindered rather than helped by a national list. And an unnamed operator meant
 * every guarded action failed on the first press, since nothing can be attributed
 * to nobody.
 *
 * Asking both here, once, turns two recurring frictions into one short screen. The
 * answers are stored locally and can be changed at any time from the header, since
 * a desk gets handed over at the end of a shift.
 */
export default function OpsOnboarding({
  initial,
  onDone,
  onCancel,
}: {
  initial?: OpsIdentity | null;
  onDone: (id: OpsIdentity) => void;
  onCancel?: () => void;
}) {
  const [operator, setOperator] = useState(initial?.operator ?? "");
  const [organisation, setOrganisation] = useState(initial?.organisation ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? DISTRICTS.filter(
          (d) => d.name.toLowerCase().includes(q) || d.nameUrdu.includes(query.trim()),
        )
      : DISTRICTS;
    const by: Record<string, typeof DISTRICTS> = {};
    for (const d of matches) (by[d.province] ??= []).push(d);
    return Object.entries(by);
  }, [query]);

  const ready = operator.trim().length > 1 && district !== "";

  return (
    <main className="min-h-screen bg-ground text-paper">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight text-brand-soft">
          AmanSignal <span className="font-normal text-paper-soft">Operations</span>
        </h1>
        <p className="mt-2 text-sm text-paper-soft">
          This board shows the incidents for one district. Reports are reconciled into
          incidents automatically; every decision about them is yours.
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <label htmlFor="op-name" className="block text-sm font-medium text-paper">
              Your name
            </label>
            <p className="mt-1 text-xs text-paper-soft">
              Recorded against every verification, assignment and duplicate decision
              you make. The audit trail has to be able to answer who decided what.
            </p>
            <input
              id="op-name"
              autoFocus
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="e.g. Hassaan Javed"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-paper outline-none focus:border-brand-soft"
            />
          </div>

          <div>
            <label htmlFor="op-org" className="block text-sm font-medium text-paper">
              Organisation <span className="font-normal text-paper-soft">(optional)</span>
            </label>
            <input
              id="op-org"
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder="e.g. Alkhidmat, Rescue 1122, District Administration"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-paper outline-none focus:border-brand-soft"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-paper">Your district</span>
            <p className="mt-1 text-xs text-paper-soft">
              You will see incidents in this district, plus any the system could not
              place. Reports from elsewhere belong to another control room.
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search districts..."
              aria-label="Search districts"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-paper outline-none focus:border-brand-soft"
            />
            <div className="mt-3 max-h-72 space-y-4 overflow-y-auto rounded-lg border border-line bg-surface/50 p-3">
              {grouped.length === 0 ? (
                <p className="px-1 py-3 text-sm text-paper-soft">
                  No district matches that. Clear the search to see all of them.
                </p>
              ) : null}
              {grouped.map(([province, list]) => (
                <div key={province}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-soft">
                    {province}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={district === d.id}
                        onClick={() => setDistrict(d.id)}
                        className={`rounded-lg px-3 py-2 text-sm ring-1 transition-colors ${
                          district === d.id
                            ? "bg-brand text-white ring-brand"
                            : "bg-surface text-paper-soft ring-line hover:text-paper"
                        }`}
                      >
                        {d.name}
                        <span className="urdu-ui ms-2 opacity-70">{d.nameUrdu}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              onDone({
                operator: operator.trim(),
                district,
                organisation: organisation.trim(),
              })
            }
            className="rounded-lg bg-brand px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            Open the board
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-6 py-3 text-paper-soft ring-1 ring-line"
            >
              Cancel
            </button>
          ) : null}
          {!ready ? (
            <p className="self-center text-xs text-paper-soft">
              Enter your name and pick a district to continue.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
