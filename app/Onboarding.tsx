"use client";

import { useState } from "react";
import { loadProfile, saveProfile, normalisePhone, type Profile } from "@/lib/profile";

/**
 * First run: set up once, calmly, so that reporting later costs one tap.
 *
 * Location and microphone are strongly recommended and asked for here, because a
 * browser grants them per origin and remembers the answer. Asking at install means
 * an emergency report raises no prompts at all.
 *
 * They are not, however, a gate. Someone who cannot or will not grant them can
 * still type a report and write their address by hand, and a typed report is worth
 * far more than a person locked out of the app. The cost of declining is stated
 * plainly rather than hidden, and the request is made again later at the moment it
 * obviously matters, which is when someone is actually filing.
 */
export default function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ location: boolean; mic: boolean } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function finish(granted: { location: boolean; mic: boolean } | null) {
    const p = loadProfile();
    const next: Profile = {
      ...p,
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
              stream.getTracks().forEach((t) => t.stop());
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

  return (
    <main dir="rtl" className="min-h-screen bg-day text-ink">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-between px-5 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
          <p className="urdu-ui mt-2 text-xl font-bold">ہنگامی اطلاع، آپ کی اپنی زبان میں</p>
          <p className="en mt-1 text-sm text-ink-soft">Emergency reporting, in your own language.</p>

          {/* Who to call back. Optional, because a report from someone who filled
              nothing in still matters, but it is the most useful thing an operator
              can have, so it is asked for first and explained. */}
          <section className="mt-7 rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
            <h2 className="urdu-ui text-lg font-semibold">آپ کی معلومات</h2>
            <p className="en mt-1 text-sm text-ink-soft">
              So a rescue team can call you back. Optional, but it is the fastest way
              for someone to reach you.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="urdu-ui text-sm font-medium">نام</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Name"
                  className="en mt-1 w-full rounded-xl border border-day-line bg-day px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="urdu-ui text-sm font-medium">موبائل نمبر</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="03XX XXXXXXX"
                  className="en mt-1 w-full rounded-xl border border-day-line bg-day px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
            </div>
          </section>

          {/* The trade is stated before anything is asked. Someone who understands
              why a step exists completes it; someone who does not, dismisses it. */}
          <section className="mt-5 rounded-2xl bg-brand/5 p-5 ring-1 ring-brand">
            <h2 className="urdu-ui text-lg font-bold">لوکیشن اور مائیکروفون</h2>
            <p className="en mt-1 text-sm text-ink-soft">
              Recommended. Grant them now and reporting later takes one tap and your
              voice, with no prompts while you are dealing with an emergency.
            </p>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start justify-between gap-3">
                <div>
                  <span className="urdu-ui text-base font-semibold">اپنی جگہ (لوکیشن)</span>
                  <p className="en text-sm text-ink-soft">
                    So a team can reach you without you having to explain where you are.
                  </p>
                </div>
                {result ? (
                  <span className={`shrink-0 text-xl ${result.location ? "text-ok" : "text-ink-soft"}`}>
                    {result.location ? "✓" : "○"}
                  </span>
                ) : null}
              </li>
              <li className="flex items-start justify-between gap-3">
                <div>
                  <span className="urdu-ui text-base font-semibold">مائیکروفون</span>
                  <p className="en text-sm text-ink-soft">
                    So you can speak your report instead of typing it.
                  </p>
                </div>
                {result ? (
                  <span className={`shrink-0 text-xl ${result.mic ? "text-ok" : "text-ink-soft"}`}>
                    {result.mic ? "✓" : "○"}
                  </span>
                ) : null}
              </li>
            </ul>
            <p className="en mt-4 text-sm text-ink-soft">
              Your location is only read when you send a report, and the microphone
              only while you are recording one.
            </p>
          </section>

          {/* Declining is allowed, and what it costs is said out loud rather than
              discovered later: typing and a hand-placed pin still work. */}
          {partial ? (
            <div role="status" className="mt-5 rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <h3 className="urdu-ui text-base font-bold">
                {!result?.location && !result?.mic
                  ? "کوئی اجازت نہیں ملی"
                  : !result?.location
                    ? "لوکیشن کی اجازت نہیں ملی"
                    : "مائیکروفون کی اجازت نہیں ملی"}
              </h3>
              <p className="en mt-1 text-sm text-ink">
                You can still report.{" "}
                {!result?.mic ? "Type your report instead of speaking it. " : ""}
                {!result?.location
                  ? "Write your address and place your location on the map by hand. "
                  : ""}
                You can turn these on later from the padlock beside the web address.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={result ? () => finish(result) : requestAccess}
            className="w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:opacity-70"
          >
            <span className="urdu-ui block">
              {busy ? "اجازت لی جا رہی ہے..." : result ? "جاری رکھیں" : "اجازت دیں اور جاری رکھیں"}
            </span>
            <span className="en text-base font-medium opacity-90">
              {busy ? "Requesting..." : result ? "Continue" : "Allow and continue"}
            </span>
          </button>

          {!result ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => finish(null)}
              className="w-full rounded-2xl px-6 py-4 text-base font-medium text-ink-soft underline underline-offset-4 disabled:opacity-50"
            >
              <span className="urdu-ui block">ابھی نہیں، خود لکھ کر بھیجوں گا</span>
              <span className="en text-sm">Not now, I will type my report</span>
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
