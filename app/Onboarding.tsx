"use client";

import { useState } from "react";

/**
 * First run, shown once and never during an emergency.
 *
 * Location and microphone are granted per origin and remembered, so the calm moment
 * to ask is when someone installs the app, not when they are standing in water. A
 * permission request made mid-emergency costs taps the reporter does not have, and a
 * refusal made under stress persists for every later report.
 *
 * Both permissions are genuinely optional: refusing either leaves typing, which is
 * always available. The screen says so, because a request that reads as a
 * precondition gets refused more often than one that reads as a choice.
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<{ location?: boolean; mic?: boolean }>({});

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
    setGranted((g) => ({ ...g, location }));

    let mic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release it straight away: this asks for permission, it does not record.
      stream.getTracks().forEach((t) => t.stop());
      mic = true;
    } catch {
      mic = false;
    }
    setGranted((g) => ({ ...g, mic }));

    setBusy(false);
    // Refusal is not a dead end. Text always works, so the app opens either way.
    setTimeout(onDone, 900);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-day text-ink">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-between px-5 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
          <p className="urdu-ui mt-2 text-xl font-bold">ہنگامی اطلاع، آپ کی اپنی زبان میں</p>
          <p className="en mt-1 text-sm text-ink-soft">Emergency reporting, in your own language.</p>

          <div className="mt-8 space-y-5">
            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <h2 className="urdu-ui text-lg font-semibold">
                اپنی جگہ کی اجازت دیں
                {granted.location === true ? <span className="text-ok"> ✓</span> : null}
              </h2>
              <p className="en mt-1 text-sm text-ink-soft">
                Allow location, so a rescue team can find you without you having to
                explain where you are.
              </p>
            </section>

            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <h2 className="urdu-ui text-lg font-semibold">
                مائیکروفون کی اجازت دیں
                {granted.mic === true ? <span className="text-ok"> ✓</span> : null}
              </h2>
              <p className="en mt-1 text-sm text-ink-soft">
                Allow the microphone, so you can speak your report instead of typing it.
              </p>
            </section>

            <p className="urdu-ui text-base font-medium">
              یہ اجازتیں ابھی دے دیں تاکہ ہنگامی وقت میں آپ کا وقت ضائع نہ ہو۔
            </p>
            <p className="en text-sm text-ink-soft">
              Granting these now means that in an emergency you only have to speak.
              Both are optional: you can always type your report instead.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={requestAccess}
            className="w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:opacity-70"
          >
            <span className="urdu-ui block">
              {busy ? "اجازت لی جا رہی ہے..." : "اجازت دیں اور شروع کریں"}
            </span>
            <span className="en text-base font-medium opacity-90">
              {busy ? "Requesting..." : "Allow and continue"}
            </span>
          </button>

          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-2xl px-6 py-4 text-base text-ink-soft"
          >
            <span className="urdu-ui block">ابھی نہیں، صرف لکھ کر بھیجوں گا</span>
            <span className="en text-sm">Not now, I will type my report</span>
          </button>
        </div>
      </div>
    </main>
  );
}
