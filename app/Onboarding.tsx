"use client";

import { useState } from "react";
import { loadProfile, saveProfile, normalisePhone, type Profile } from "@/lib/profile";
import { LANGUAGES, stringsFor, type Lang } from "@/lib/i18n";

/**
 * First run: choose a language, then set up once, calmly, so that reporting later
 * costs one tap.
 *
 * Language comes first because everything after it is written in one language
 * rather than two stacked together. Asking is one extra screen and removes a line
 * of unread text from every element for the life of the install.
 *
 * Location and microphone are strongly recommended and asked for here, because a
 * browser grants them per origin and remembers the answer: asking at install means
 * an emergency report raises no prompts at all. They are not a gate, though.
 * Someone who cannot or will not grant them can still type a report and place their
 * own pin, and a typed report is worth far more than a person locked out of the
 * app. What declining costs is stated plainly rather than left to be discovered,
 * and the request is repeated later at the moment its purpose is self-evident.
 */
export default function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [lang, setLang] = useState<Lang | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ location: boolean; mic: boolean } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Before a language is chosen there is nothing to write copy in, so the picker
  // is the whole screen and carries no prose at all.
  if (lang === null) {
    return (
      <main className="min-h-screen bg-day text-ink">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-5 py-10">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-brand">AmanSignal</h1>
            <p className="urdu-ui mt-3 text-xl font-semibold">اپنی زبان منتخب کریں</p>
            <p className="en mt-1 text-base text-ink-soft" dir="ltr">
              Choose your language
            </p>
          </div>
          <div className="space-y-3">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className="w-full rounded-2xl bg-day-surface px-6 py-6 text-2xl font-bold ring-1 ring-day-line transition-colors hover:bg-brand hover:text-white"
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const t = stringsFor(lang);

  function finish(granted: { location: boolean; mic: boolean } | null) {
    const p = loadProfile();
    const next: Profile = {
      ...p,
      lang: lang!,
      name: name.trim().slice(0, 120),
      phone: phone.trim() ? normalisePhone(phone) : "",
      onboarded: true,
      permissionsAsked: granted !== null,
    };
    saveProfile(next);
    onDone(next);
  }

  async function requestAccess() {
    setBusy(true);

    const location = await new Promise<boolean>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(false);
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });

    // getUserMedia never settles while a prompt sits unanswered, and an unbounded
    // await leaves the screen stuck with no way forward. A long silence is treated
    // as a refusal so the person always reaches the next screen.
    const mic = await Promise.race([
      navigator.mediaDevices
        ? navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              // This asks for permission; it does not record. Release it at once.
              stream.getTracks().forEach((s) => s.stop());
              return true;
            })
            .catch(() => false)
        : Promise.resolve(false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30000)),
    ]);

    setResult({ location, mic });
    setBusy(false);
    if (location && mic) setTimeout(() => finish({ location, mic }), 700);
  }

  const partial = result !== null && (!result.location || !result.mic);
  const deniedTitle =
    !result?.location && !result?.mic
      ? t.deniedTitleBoth
      : !result?.location
        ? t.deniedTitleLocation
        : t.deniedTitleMic;

  return (
    <main dir={t.dir} className="min-h-screen bg-day text-ink">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-between px-5 py-8">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
              <p className={`${t.face} mt-2 text-xl font-bold`}>{t.tagline}</p>
            </div>
            <button
              type="button"
              onClick={() => setLang(lang === "ur" ? "en" : "ur")}
              className="shrink-0 rounded-xl bg-day-surface px-3 py-2 text-sm font-medium text-ink-soft ring-1 ring-day-line"
            >
              {lang === "ur" ? "English" : "اردو"}
            </button>
          </div>

          {/* Who to call back. Optional, because a report from someone who filled
              nothing in still matters, but it is the most useful thing an operator
              can have, so it is asked for first and explained. */}
          <section className="mt-7 rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
            <h2 className={`${t.face} text-lg font-semibold`}>{t.yourDetails}</h2>
            <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.yourDetailsWhy}</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className={`${t.face} text-sm font-medium`}>{t.nameLabel}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  dir="auto"
                  placeholder={t.namePlaceholder}
                  className="mt-1 w-full rounded-xl border border-day-line bg-day px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className={`${t.face} text-sm font-medium`}>{t.phoneLabel}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder={t.phonePlaceholder}
                  className="mt-1 w-full rounded-xl border border-day-line bg-day px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
            </div>
          </section>

          {/* The trade is stated before anything is asked. Someone who understands
              why a step exists completes it; someone who does not, dismisses it. */}
          <section className="mt-5 rounded-2xl bg-brand/5 p-5 ring-1 ring-brand">
            <h2 className={`${t.face} text-lg font-bold`}>{t.permissionsTitle}</h2>
            <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.permissionsWhy}</p>
            <ul className="mt-4 space-y-3">
              {[
                { on: result?.location, title: t.permLocation, why: t.permLocationWhy },
                { on: result?.mic, title: t.permMic, why: t.permMicWhy },
              ].map((row) => (
                <li key={row.title} className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`${t.face} text-base font-semibold`}>{row.title}</span>
                    <p className={`${t.face} text-sm text-ink-soft`}>{row.why}</p>
                  </div>
                  {result ? (
                    <span className={`shrink-0 text-xl ${row.on ? "text-ok" : "text-ink-soft"}`}>
                      {row.on ? "✓" : "○"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className={`${t.face} mt-4 text-sm text-ink-soft`}>{t.permPrivacy}</p>
          </section>

          {/* Declining is allowed, and what it costs is said out loud rather than
              discovered later: typing and a hand-placed pin still work. */}
          {partial ? (
            <div role="status" className="mt-5 rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <h3 className={`${t.face} text-base font-bold`}>{deniedTitle}</h3>
              <p className={`${t.face} mt-1 text-sm text-ink`}>
                {t.deniedStillReport}{" "}
                {!result?.mic ? `${t.deniedTypeInstead} ` : ""}
                {!result?.location ? `${t.deniedPinInstead} ` : ""}
                {t.deniedTurnOnLater}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={result ? () => finish(result) : requestAccess}
            className={`${t.face} w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:opacity-70`}
          >
            {busy ? t.requesting : result ? t.continueOn : t.allowAndContinue}
          </button>

          {!result ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => finish(null)}
              className={`${t.face} w-full rounded-2xl px-6 py-4 text-base font-medium text-ink-soft underline underline-offset-4 disabled:opacity-50`}
            >
              {t.notNow}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
