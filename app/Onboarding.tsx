"use client";

import { useState } from "react";

/**
 * First run. Location and microphone are requested as requirements, not options.
 *
 * They are granted per origin and remembered, so the moment to ask is at install,
 * never mid-emergency: a prompt raised while someone is standing in water costs taps
 * they do not have, and a refusal made under stress persists for every later report.
 * There is deliberately no skip, because an optional-looking request gets dismissed
 * and the friction reappears at the worst possible moment.
 *
 * A denial is not routed around, it is resolved here. Letting someone continue with
 * a blocked permission only defers the failure to the emergency itself, which is the
 * one moment they cannot afford it: anyone struggling to grant access now will be in
 * far more trouble doing it while standing in water. So a refusal explains exactly
 * which permission was blocked and how to re-enable it, and the only way forward is
 * to fix it and retry, while there is still time and calm to do so.
 */
export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ location: boolean; mic: boolean } | null>(null);

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
    // await leaves the screen stuck on "requesting" with no way forward. Treating a
    // long silence as a refusal at least reaches the recovery instructions.
    const mic = await Promise.race([
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          // This asks for permission; it does not record. Release it at once.
          stream.getTracks().forEach((t) => t.stop());
          return true;
        })
        .catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30000)),
    ]);

    setResult({ location, mic });
    setBusy(false);
    if (location && mic) setTimeout(onDone, 700);
  }

  const denied = result !== null && (!result.location || !result.mic);

  return (
    <main dir="rtl" className="min-h-screen bg-day text-ink">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-between px-5 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
          <p className="urdu-ui mt-2 text-xl font-bold">ہنگامی اطلاع، آپ کی اپنی زبان میں</p>
          <p className="en mt-1 text-sm text-ink-soft">Emergency reporting, in your own language.</p>

          {/* The trade is stated before anything is asked. Someone who understands
              why a step exists completes it; someone who does not, dismisses it. */}
          <div className="mt-8 rounded-2xl bg-brand/5 p-5 ring-1 ring-brand">
            <h2 className="urdu-ui text-lg font-bold">جاری رکھنے کے لیے دو اجازتیں درکار ہیں</h2>
            <p className="en mt-1 text-sm text-ink-soft">
              AmanSignal needs two permissions before you can continue.
            </p>
            <p className="urdu-ui mt-4 text-base font-semibold text-ink">
              ابھی ایک منٹ لگائیں تاکہ ہنگامی وقت میں ایک لمحہ بھی ضائع نہ ہو۔
            </p>
            <p className="en mt-1 text-sm text-ink">
              Spend a minute on this now so that in an emergency you lose none. Set up
              here, reporting takes one tap and your voice. Left until the water is
              rising, these same prompts cost time you will not have.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="urdu-ui text-lg font-semibold">اپنی جگہ (لوکیشن)</h3>
                  <p className="en mt-1 text-sm text-ink-soft">
                    Location, so a rescue team can reach you without you having to
                    explain where you are.
                  </p>
                </div>
                {result ? (
                  <span className={`shrink-0 text-xl ${result.location ? "text-ok" : "text-critical"}`}>
                    {result.location ? "✓" : "✕"}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="urdu-ui text-lg font-semibold">مائیکروفون</h3>
                  <p className="en mt-1 text-sm text-ink-soft">
                    The microphone, so you can speak your report instead of typing it.
                  </p>
                </div>
                {result ? (
                  <span className={`shrink-0 text-xl ${result.mic ? "text-ok" : "text-critical"}`}>
                    {result.mic ? "✓" : "✕"}
                  </span>
                ) : null}
              </div>
            </section>

            <p className="en text-sm text-ink-soft">
              Your location is only read when you send a report, and the microphone
              only while you are recording one.
            </p>
          </div>

          {denied ? (
            <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 ring-1 ring-critical">
              <h3 className="urdu-ui text-base font-bold text-critical">
                اجازت نہیں ملی
              </h3>
              <p className="en mt-1 text-sm text-ink">
                Your browser blocked {!result?.location && !result?.mic
                  ? "both permissions"
                  : !result?.location ? "location" : "the microphone"}.
                We cannot ask again from here, so please enable{" "}
                {!result?.location && !result?.mic
                  ? "Location and Microphone"
                  : !result?.location ? "Location" : "Microphone"}
                {" "}yourself, then tap Try again.
              </p>
              <ul className="en mt-3 list-disc space-y-1 pr-5 text-sm text-ink-soft">
                <li>Tap the padlock or icon beside the web address.</li>
                <li>Open Permissions, or Site settings.</li>
                <li>Set the blocked permission to Allow.</li>
                <li>Return here and tap Try again.</li>
              </ul>
              <p className="urdu-ui mt-3 text-sm font-medium text-ink">
                یہ اجازت اب دینا ضروری ہے۔ ہنگامی وقت میں یہ مسئلہ حل کرنا بہت مشکل ہوگا۔
              </p>
              <p className="en mt-1 text-sm text-ink-soft">
                It is important to resolve this now. In an emergency there will be no
                time to fix a blocked permission.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={requestAccess}
            className="w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:opacity-70"
          >
            <span className="urdu-ui block">
              {busy ? "اجازت لی جا رہی ہے..." : denied ? "دوبارہ کوشش کریں" : "اجازت دیں اور جاری رکھیں"}
            </span>
            <span className="en text-base font-medium opacity-90">
              {busy ? "Requesting..." : denied ? "Try again" : "Allow and continue"}
            </span>
          </button>

        </div>
      </div>
    </main>
  );
}
