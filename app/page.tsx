"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Extraction } from "@/lib/schema";
import Onboarding from "./Onboarding";

const ONBOARDED_KEY = "amansignal.onboarded";

type Question = { field: string; ur: string; en: string };
type Phase = "compose" | "sending" | "review" | "done" | "error";

const URGENCY_LABEL: Record<string, { ur: string; en: string }> = {
  trapped_people: { ur: "لوگ پھنسے ہوئے ہیں", en: "People trapped" },
  medical_need: { ur: "طبی مدد درکار", en: "Medical help needed" },
  rising_water: { ur: "پانی بڑھ رہا ہے", en: "Water rising" },
  blocked_access: { ur: "راستہ بند", en: "Access blocked" },
  no_safe_route: { ur: "محفوظ راستہ نہیں", en: "No safe route" },
  structural_damage: { ur: "عمارت کو نقصان", en: "Structural damage" },
};

/** Urdu numerals, so the spoken sentence contains no Latin digits. */
const URDU_NUM = ["صفر", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس"];

/**
 * The Urdu sentence read aloud, built from the same fields shown on screen so the
 * audio and the text can never disagree.
 *
 * Latin digits and clipped fragments make the model treat the sentence as malformed
 * and refuse it aloud, so numbers are spelled out in Urdu and each clause is a whole
 * phrase rather than a label.
 */
function spokenSummary(e: Extraction): string {
  const parts: string[] = [];
  if (e.people_affected !== null) {
    const n = e.people_affected <= 10 ? URDU_NUM[e.people_affected] : String(e.people_affected);
    parts.push(`${n} افراد متاثر ہیں`);
  }
  const vuln = e.vulnerable_people.map((v) => VULNERABLE_LABEL[v]?.ur).filter(Boolean);
  if (vuln.length) parts.push(`${vuln.join(" اور ")} شامل ہیں`);
  if (e.urgency_indicators.includes("trapped_people")) parts.push("لوگ پھنسے ہوئے ہیں");
  if (e.urgency_indicators.includes("medical_need")) parts.push("طبی مدد درکار ہے");
  if (e.urgency_indicators.includes("rising_water")) parts.push("پانی بڑھ رہا ہے");
  if (e.road_access === "blocked") parts.push("راستہ بند ہے");
  else if (e.road_access === "partial") parts.push("راستہ جزوی طور پر کھلا ہے");
  if (!parts.length) return "ہم نے آپ کی اطلاع وصول کر لی ہے۔";
  return `ہم نے یہ سمجھا ہے کہ ${parts.join("، اور ")}۔`;
}

const VULNERABLE_LABEL: Record<string, { ur: string; en: string }> = {
  elderly: { ur: "بزرگ", en: "Elderly" },
  children: { ur: "بچے", en: "Children" },
  disabled: { ur: "معذور افراد", en: "Disabled" },
  pregnant: { ur: "حاملہ خاتون", en: "Pregnant" },
  injured: { ur: "زخمی", en: "Injured" },
};

export default function CitizenIntake() {
  const [phase, setPhase] = useState<Phase>("compose");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const askedForLocation = useRef(false);
  // null while unknown, so the intake screen never flashes before onboarding.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  // Read the confirmation aloud. Failure is silent by design: the text is already
  // on screen, so a speech outage must not block the citizen from confirming.
  const speak = useCallback(async (sentence: string) => {
    setSpeaking(true);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      audioEl.current?.pause();
      const el = new Audio(url);
      audioEl.current = el;
      el.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      await el.play();
    } catch {
      // Speech is an enhancement; the written summary carries the meaning.
    } finally {
      setSpeaking(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      startComposing();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        setAudio(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone unavailable. You can still type your report.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
    setRecording(false);
  }, []);

  const getLocation = useCallback(() => {
    if (askedForLocation.current) return;
    askedForLocation.current = true;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          // Accuracy decides whether these coordinates are worth acting on. A
          // reading good to 20m puts a boat at the door; one good to 3km only
          // narrows it to a neighbourhood, and a dispatcher must be able to tell
          // those apart rather than seeing an undifferentiated "GPS" flag.
          accuracy: Math.round(p.coords.accuracy),
        });
        setLocating(false);
        setLocationDenied(false);
      },
      () => {
        setLocating(false);
        setLocationDenied(true);
        // Allow a retry: the first refusal is often reflexive, and the button
        // stays available for someone who changes their mind.
        askedForLocation.current = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  /**
   * Permission is requested once, during onboarding. From then on the browser
   * remembers the grant, so capturing position on load raises no prompt and an
   * emergency report costs nothing but speaking. Capture is started here rather
   * than on first interaction because a fix can take several seconds to acquire,
   * and it should already be waiting by the time the report is sent.
   */
  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDED_KEY) === "1";
    setOnboarded(seen);
    if (seen) getLocation();
  }, [getLocation]);

  const startComposing = useCallback(() => {
    // Anyone who declined at onboarding still gets one contextual chance, at the
    // moment their intent is unambiguous.
    if (!askedForLocation.current && !coords) getLocation();
  }, [coords, getLocation]);

  async function submit() {
    setPhase("sending");
    setError(null);
    const fd = new FormData();
    if (text.trim()) fd.set("text", text.trim());
    if (audio) fd.set("audio", new File([audio], "report.webm", { type: audio.type }));
    if (image) fd.set("image", image);
    if (coords) {
      fd.set("lat", String(coords.lat));
      fd.set("lon", String(coords.lon));
      fd.set("accuracy", String(coords.accuracy));
    }
    try {
      const res = await fetch("/api/report", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Your report was saved; please try again.");
        setPhase("error");
        return;
      }
      setReportId(json.report_id);
      setExtraction(json.extraction);
      setQuestions(json.questions ?? []);
      setPhase("review");
    } catch {
      setError("Could not reach the service. Check your connection and try again.");
      setPhase("error");
    }
  }

  async function confirmReport() {
    setPhase("sending");
    const payload = {
      report_id: reportId,
      answers: questions
        .filter((q) => answers[q.field]?.trim())
        .map((q) => ({ field: q.field, question: q.en, answer: answers[q.field].trim() })),
    };
    const res = await fetch("/api/report/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not confirm the report.");
      setPhase("error");
      return;
    }
    setPhase("done");
  }

  const hasContent = text.trim() !== "" || audio !== null || image !== null;

  if (onboarded === null) {
    return <main className="min-h-screen bg-day" aria-busy="true" />;
  }

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setOnboarded(true);
          getLocation();
        }}
      />
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-day text-ink">
      <div className="mx-auto max-w-xl px-5 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
          <p className="urdu-ui mt-1 text-lg font-semibold">ہنگامی اطلاع دیں</p>
          <p className="en mt-1 text-sm text-ink-soft">Report an emergency</p>
        </header>

        {phase === "compose" || phase === "error" ? (
          <div className="space-y-5">
            <section className="rounded-2xl bg-day-surface p-5 shadow-sm ring-1 ring-day-line">
              <label htmlFor="report" className="urdu-ui block text-base font-semibold">
                کیا ہوا ہے؟ اردو، رومن اردو یا انگریزی میں لکھیں۔
              </label>
              <p className="en mb-3 mt-1 text-sm text-ink-soft">
                Describe what is happening, in any language.
              </p>
              <textarea
                id="report"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value.length === 1) startComposing();
                }}
                rows={5}
                dir="auto"
                placeholder="مثال: ہمارے گھر میں پانی آ گیا ہے..."
                className="w-full rounded-xl border border-day-line p-4 text-lg leading-relaxed outline-none focus:border-brand"
              />
            </section>

            <section className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`flex items-center justify-between rounded-2xl px-5 py-4 text-left text-lg font-semibold ring-1 transition-colors ${
                  recording
                    ? "bg-critical text-white ring-critical"
                    : "bg-day-surface ring-day-line hover:bg-slate-50"
                }`}
              >
                <span>
                  <span className="urdu-ui block text-base">
                    {recording ? "ریکارڈنگ جاری ہے، روکنے کے لیے دبائیں" : "آواز میں بتائیں"}
                  </span>
                  <span className={`en text-sm ${recording ? "text-white/80" : "text-ink-soft"}`}>
                    {recording ? "Recording, tap to stop" : "Record a voice note"}
                  </span>
                </span>
                <span aria-hidden className="text-2xl">{recording ? "■" : "●"}</span>
              </button>
              {audio && !recording ? (
                <p className="en text-sm text-ok">Voice note attached.</p>
              ) : null}

              <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-day-surface px-5 py-4 text-lg font-semibold ring-1 ring-day-line hover:bg-slate-50">
                <span>
                  <span className="urdu-ui block text-base">تصویر لگائیں</span>
                  <span className="en text-sm text-ink-soft">Add a photo</span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    setImage(e.target.files?.[0] ?? null);
                    startComposing();
                  }}
                />
                <span aria-hidden className="text-2xl">+</span>
              </label>
              {image ? <p className="en text-sm text-ok">Photo attached: {image.name}</p> : null}

              <button
                type="button"
                onClick={getLocation}
                className="flex items-center justify-between rounded-2xl bg-day-surface px-5 py-4 text-lg font-semibold ring-1 ring-day-line hover:bg-slate-50"
              >
                <span>
                  <span className="urdu-ui block text-base">اپنی جگہ بھیجیں</span>
                  <span className="en text-sm text-ink-soft">
                    {coords
                      ? coords.accuracy > 0
                        ? `Location attached (accurate to about ${coords.accuracy}m)`
                        : "Location attached"
                      : locating
                        ? "Finding you..."
                        : locationDenied
                          ? "Location unavailable, tap to try again"
                          : "Share your location"}
                  </span>
                </span>
                <span aria-hidden className="text-2xl">{coords ? "✓" : "◎"}</span>
              </button>
            </section>

            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-critical">{error}</p>
            ) : null}

            <button
              type="button"
              disabled={!hasContent}
              onClick={submit}
              className="w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:bg-slate-300"
            >
              <span className="urdu-ui block">اطلاع بھیجیں</span>
              <span className="en text-base font-medium opacity-90">Send report</span>
            </button>
          </div>
        ) : null}

        {phase === "sending" ? (
          <div className="rounded-2xl bg-day-surface p-8 text-center ring-1 ring-day-line">
            <p className="urdu text-lg font-semibold">آپ کی اطلاع پڑھی جا رہی ہے...</p>
            <p className="en mt-2 text-sm text-ink-soft">Understanding your report. This takes a few seconds.</p>
          </div>
        ) : null}

        {phase === "review" && extraction ? (
          <div className="space-y-5">
            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="urdu-ui text-lg font-bold">ہم نے یہ سمجھا</h2>
                  <p className="en text-sm text-ink-soft">This is what we understood. Correct it if it is wrong.</p>
                </div>
                <button
                  type="button"
                  onClick={() => speak(spokenSummary(extraction))}
                  aria-label="Listen to this summary in Urdu"
                  className="shrink-0 cursor-pointer rounded-xl bg-brand px-4 py-3 text-white"
                >
                  <span className="urdu-ui block text-sm font-semibold">
                    {speaking ? "سن رہے ہیں..." : "سنیں"}
                  </span>
                  <span className="en text-xs opacity-90">{speaking ? "Playing" : "Listen"}</span>
                </button>
              </div>

              <dl className="space-y-3 text-base">
                {extraction.urgency_indicators.length ? (
                  <div>
                    <dt className="en text-sm text-ink-soft">Situation</dt>
                    <dd className="flex flex-wrap gap-2 pt-1">
                      {extraction.urgency_indicators.map((u) => (
                        <span key={u} className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
                          {URGENCY_LABEL[u]?.en ?? u}
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}

                {extraction.people_affected !== null ? (
                  <div>
                    <dt className="en text-sm text-ink-soft">People affected</dt>
                    <dd className="text-lg font-semibold">{extraction.people_affected}</dd>
                  </div>
                ) : null}

                {extraction.vulnerable_people.length ? (
                  <div>
                    <dt className="en text-sm text-ink-soft">Vulnerable people present</dt>
                    <dd className="flex flex-wrap gap-2 pt-1">
                      {extraction.vulnerable_people.map((v) => (
                        <span key={v} className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium">
                          {VULNERABLE_LABEL[v]?.en ?? v}
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}

                {/* Whichever transcript came back. A spoken report can return only
                    the Roman form, and showing nothing leaves the reporter unable to
                    check that they were heard correctly, which is the entire purpose
                    of this screen. */}
                {extraction.transcript_urdu || extraction.transcript_roman_urdu ? (
                  <div>
                    <dt className="en text-sm text-ink-soft">What we heard</dt>
                    {extraction.transcript_urdu ? (
                      <dd className="urdu text-base">{extraction.transcript_urdu}</dd>
                    ) : (
                      <dd className="roman-urdu text-base">{extraction.transcript_roman_urdu}</dd>
                    )}
                  </div>
                ) : null}
              </dl>
            </section>

            {questions.length ? (
              <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-brand">
                <h2 className="urdu-ui text-lg font-bold">ایک بات اور</h2>
                <p className="en mb-4 text-sm text-ink-soft">
                  This helps the rescue team reach you.
                </p>
                {questions.map((q) => (
                  <div key={q.field} className="mb-4">
                    <label htmlFor={`q-${q.field}`} className="urdu-ui block text-base font-semibold">
                      {q.ur}
                    </label>
                    <p className="en mb-2 text-sm text-ink-soft">{q.en}</p>
                    <input
                      id={`q-${q.field}`}
                      dir="auto"
                      value={answers[q.field] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))}
                      className="w-full rounded-xl border border-day-line p-3 text-lg outline-none focus:border-brand"
                    />
                  </div>
                ))}
              </section>
            ) : null}

            <button
              type="button"
              onClick={confirmReport}
              className="w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white"
            >
              <span className="urdu-ui block">تصدیق کریں اور بھیجیں</span>
              <span className="en text-base font-medium opacity-90">Confirm and send</span>
            </button>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="rounded-2xl bg-day-surface p-8 text-center ring-1 ring-ok">
            <p className="urdu text-xl font-bold text-ok">آپ کی اطلاع موصول ہو گئی ہے</p>
            <p className="en mt-2 text-ink-soft">
              Your report has been received and sent to the relief team.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
