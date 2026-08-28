"use client";

import { useState, useRef, useCallback } from "react";
import type { Extraction } from "@/lib/schema";

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
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
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
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

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
                onChange={(e) => setText(e.target.value)}
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
                  onChange={(e) => setImage(e.target.files?.[0] ?? null)}
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
                    {coords ? "Location attached" : locating ? "Finding you..." : "Share your location"}
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
              <h2 className="urdu-ui text-lg font-bold">ہم نے یہ سمجھا</h2>
              <p className="en mb-4 text-sm text-ink-soft">This is what we understood. Correct it if it is wrong.</p>

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

                {extraction.transcript_urdu ? (
                  <div>
                    <dt className="en text-sm text-ink-soft">What we heard</dt>
                    <dd className="urdu text-base">{extraction.transcript_urdu}</dd>
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
