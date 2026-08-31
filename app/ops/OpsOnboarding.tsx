"use client";

import { useState } from "react";
import Mark from "../Mark";
import DistrictSelect from "./DistrictSelect";
import { opsStringsFor } from "@/lib/i18n-ops";
import { LANGUAGES, type Lang } from "@/lib/i18n";

export type OpsIdentity = {
  operator: string;
  district: string;
  organisation: string;
  /**
   * The board's own language, separate from the citizen app's. The two surfaces
   * are used by different people on different devices, so one preference cannot
   * stand for both without each overwriting the other.
   */
  lang: Lang;
};

/**
 * Who is at this desk, which district they run, and in which language.
 *
 * The board previously opened onto every incident in the country with an empty
 * name box in the corner. Both are wrong for how relief works: a control room
 * runs one district and cannot task a boat in another province, and an unnamed
 * operator meant every guarded action failed on first press, since nothing can
 * be attributed to nobody.
 *
 * Asking here, once, turns recurring frictions into one short screen. The
 * answers are stored locally and changeable from the header, since a desk gets
 * handed over at the end of a shift.
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
  const [lang, setLang] = useState<Lang>(initial?.lang ?? "en");

  const t = opsStringsFor(lang);
  const ready = operator.trim().length > 1 && district !== "";

  return (
    <main dir={t.dir} className="ops-surface min-h-screen bg-ground text-paper">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-brand-soft">
            <Mark className="h-8 w-8 shrink-0" />
            AmanSignal <span className="font-normal text-paper-soft">{t.operations}</span>
          </h1>
          <div dir="ltr" className="flex shrink-0 rounded-lg bg-surface p-1 ring-1 ring-line">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  lang === l.code ? "bg-brand text-white" : "text-paper-soft"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <p className={`${t.face} mt-3 text-sm text-paper-soft`}>{t.setupIntro}</p>

        <div className="mt-8 space-y-6">
          <div>
            <label htmlFor="op-name" className={`${t.face} block text-sm font-medium text-paper`}>
              {t.yourName}
            </label>
            <p className={`${t.face} mt-1 text-xs text-paper-soft`}>{t.yourNameWhy}</p>
            <input
              id="op-name"
              autoFocus
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder={t.namePlaceholder}
              dir="auto"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-paper outline-none focus:border-brand-soft"
            />
          </div>

          <div>
            <label htmlFor="op-org" className={`${t.face} block text-sm font-medium text-paper`}>
              {t.organisation} <span className="font-normal text-paper-soft">({t.optional})</span>
            </label>
            <input
              id="op-org"
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder={t.orgPlaceholder}
              dir="auto"
              className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-3 text-paper outline-none focus:border-brand-soft"
            />
          </div>

          <div>
            <span className={`${t.face} block text-sm font-medium text-paper`}>{t.yourDistrict}</span>
            <p className={`${t.face} mt-1 text-xs text-paper-soft`}>{t.yourDistrictWhy}</p>
            <div className="mt-2">
              <DistrictSelect value={district} onChange={setDistrict} t={t} lang={lang} />
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
                lang,
              })
            }
            className={`${t.face} rounded-lg bg-brand px-6 py-3 font-semibold text-white disabled:opacity-40`}
          >
            {t.openBoard}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className={`${t.face} rounded-lg px-6 py-3 text-paper-soft ring-1 ring-line`}
            >
              {t.cancel}
            </button>
          ) : null}
          {!ready ? (
            <p className={`${t.face} self-center text-xs text-paper-soft`}>{t.needNameAndDistrict}</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
