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
 * A browser denial is a different thing from a skip, and has to be handled. Once
 * refused, the page cannot prompt again; only the person can, in site settings. An
 * onboarding with no path after a denial does not produce a compliant user, it
 * produces someone who cannot report at all, including by typing. So a denial gets
 * instructions for re-enabling and one subordinate way through, shown only after the
 * refusal has actually happened.
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

    let mic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // This asks for permission; it does not record. Release the device at once.
      stream.getTracks().forEach((t) => t.stop());
      mic = true;
    } catch {
      mic = false;
    }

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

          <div className="mt-8 rounded-2xl bg-brand/5 p-5 ring-1 ring-brand">
            <h2 className="urdu-ui text-lg font-bold">جاری رکھنے کے لیے دو اجازتیں درکار ہیں</h2>
            <p className="en mt-1 text-sm text-ink-soft">
              AmanSignal needs two permissions to work. Please allow both to continue.
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

            <p className="urdu-ui text-base font-medium">
              یہ اجازتیں ابھی دے دیں تاکہ ہنگامی وقت میں صرف بولنا کافی ہو۔
            </p>
            <p className="en text-sm text-ink-soft">
              Granting these now means that in an emergency you only have to speak.
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
                We cannot ask again from here. Open the padlock icon beside the web
                address, allow{" "}
                {!result?.location && !result?.mic
                  ? "Location and Microphone"
                  : !result?.location ? "Location" : "Microphone"}
                , then tap Try again.
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

          {/* Only after a real denial, and deliberately understated: someone who
              cannot grant permission must still be able to report an emergency. */}
          {denied ? (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-xl px-6 py-3 text-sm text-ink-soft underline underline-offset-4"
            >
              <span className="urdu-ui block">اجازت کے بغیر صرف لکھ کر اطلاع دیں</span>
              <span className="en text-xs">Report by typing only, without these permissions</span>
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
