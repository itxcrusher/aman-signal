"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Extraction } from "@/lib/schema";
import Onboarding from "./Onboarding";
import dynamic from "next/dynamic";
import MyReports from "./MyReports";
import { loadProfile, saveProfile, type Profile } from "@/lib/profile";
import LanguageToggle from "./LanguageToggle";
import Mark from "./Mark";
/**
 * The confirmation screen's two heaviest pieces, kept off the first paint.
 *
 * Neither can be reached without first writing a report and waiting several
 * seconds for the model, so loading them up front spends a frightened person's
 * bandwidth on a screen they may never see. LocationPin also pulls Leaflet,
 * which is the single largest dependency in the project.
 */
const ReviewCard = dynamic(() => import("./ReviewCard"), { ssr: false });
const LocationPin = dynamic(() => import("./LocationPin"), { ssr: false });
import { stringsFor, type Lang } from "@/lib/i18n";
import { normaliseImage } from "@/lib/image";
import { enqueue, flush, queued, online } from "@/lib/queue";

type Question = { field: string; ur: string; en: string };
type Phase = "compose" | "sending" | "review" | "done" | "error" | "queued";

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
  // Set when the model could not read the attached photo and the rest of the
  // report went through without it.
  const [photoDropped, setPhotoDropped] = useState(false);
  // Reports composed with no network, waiting for one.
  const [pending, setPending] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [flushNote, setFlushNote] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const askedForLocation = useRef(false);
  // null while unknown, so the intake screen never flashes before onboarding.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"report" | "mine">("report");
  // A pin the citizen placed by hand on the confirmation map. It overrides the
  // phone's fix because they are standing at the place and the phone is guessing.
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  // A written address. The only location available to someone whose browser
  // refuses geolocation, which on a plain-http origin is every phone.
  const [address, setAddress] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const peakLevel = useRef(0);
  const [silentMic, setSilentMic] = useState(false);
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
    const p = loadProfile();
    setProfile(p);
    // Only chase a fix for someone who already granted the permission. Asking here
    // would raise a prompt on launch, which is the thing setting up at install is
    // meant to avoid, and a refusal made on launch is sticky.
    if (p.onboarded && p.permissionsAsked) getLocation();
  }, [getLocation]);

  /**
   * An explicit request, from someone pressing a button. Unlike the passive
   * attempt on launch this always tries again, because a person asking for it is
   * not the same as the app guessing they want it.
   */
  const requestLocation = useCallback(() => {
    askedForLocation.current = false;
    setLocating(true);
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setCoords({
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            accuracy: Math.round(p.coords.accuracy),
          });
          setLocating(false);
          setLocationDenied(false);
          resolve(true);
        },
        () => {
          setLocating(false);
          setLocationDenied(true);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (!askedForLocation.current && !coords) getLocation();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      /**
       * Watch the signal while recording.
       *
       * A muted or dead input still produces a valid, correctly sized audio file
       * containing pure silence. Sent onward, that silence reaches the model, and a
       * model asked to interpret an emergency report from nothing is being invited
       * to invent one: an earlier silent recording came back as a fluent flood
       * report describing people trapped who did not exist. Catching it here means
       * the citizen is told their microphone is not working, at the moment they can
       * still do something about it, instead of a dispatcher receiving fiction.
       */
      audioCtx.current?.close().catch(() => {});
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      peakLevel.current = 0;
      const sample = () => {
        if (ctx.state === "closed") return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        peakLevel.current = Math.max(peakLevel.current, peak);
        if (recorder.current?.state === "recording") requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);

      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        // A live microphone in a quiet room still registers a few counts of noise;
        // a dead or muted one sits flat at zero.
        const heard = peakLevel.current > 2;
        setSilentMic(!heard);
        setAudio(heard ? new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }) : null);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setError("Microphone unavailable. You can still type your report.");
    }
  }, [coords, getLocation]);

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
    setRecording(false);
  }, []);

  /**
   * Empty the outbox whenever there is a network to empty it into.
   *
   * Run on load and on the browser's online event, because the moment signal
   * returns is exactly when nobody is looking at the screen. navigator.onLine is
   * optimistic and often wrong in the useful direction, so a failed flush simply
   * leaves everything queued for the next attempt.
   */
  const drain = useCallback(async () => {
    const waiting = await queued();
    setPending(waiting.length);
    if (!waiting.length || !online()) return;
    setFlushing(true);
    try {
      const res = await flush();
      setPending(res.remaining);
      if (res.sent > 0) setFlushNote(stringsFor(loadProfile().lang).pendingSent(res.sent));
    } finally {
      setFlushing(false);
    }
  }, []);

  useEffect(() => {
    drain();
    const onOnline = () => drain();
    window.addEventListener("online", onOnline);
    /**
     * Also on a timer, because the two events are not enough on their own.
     * An attempt that fails, or that is skipped because another page was
     * already sending, has nothing to wake it again: navigator.onLine does not
     * fire when a connection goes from unusable to usable, which on a damaged
     * network is most of the recoveries. Without this a report can sit in the
     * outbox with the app open and the signal back.
     */
    const timer = setInterval(drain, 30000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [drain]);

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
    // Who to call back. Optional throughout: a report from someone who filled in
    // nothing is still a report, and is never blocked for want of a name.
    if (profile?.reporterId) fd.set("reporter_id", profile.reporterId);
    if (profile?.name) fd.set("reporter_name", profile.name);
    if (profile?.phone) fd.set("reporter_phone", profile.phone);
    try {
      const res = await fetch("/api/report", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json.reason === "image_rejected"
            ? t.errorPhoto
            : json.reason === "network"
              ? t.errorNetwork
              : json.reason === "upstream" || json.reason === "no_credential"
                ? t.errorService
                : t.errorGeneric,
        );
        setPhase("error");
        return;
      }
      setPhotoDropped(Boolean(json.image_dropped));
      setReportId(json.report_id);
      setExtraction(json.extraction);
      setQuestions(json.questions ?? []);
      setPhase("review");
    } catch {
      // The request never reached the server. Queue it rather than telling
      // someone in a flood to type it all again, which is the response that
      // costs the most at the moment they can least afford it.
      try {
        await enqueue({
          text: text.trim() || null,
          audio,
          image,
          lat: coords?.lat ?? null,
          lon: coords?.lon ?? null,
          accuracy: coords?.accuracy ?? null,
          locationText: address.trim() || null,
          reporterId: profile?.reporterId ?? "",
          reporterName: profile?.name ?? "",
          reporterPhone: profile?.phone ?? "",
        });
        setPending((n) => n + 1);
        setPhase("queued");
      } catch {
        // Even the outbox failed, which means storage is unavailable. Now it is
        // honest to say the report could not be kept.
        setError(t.errorNetwork);
        setPhase("error");
      }
    }
  }

  async function confirmReport() {
    setPhase("sending");
    const payload = {
      report_id: reportId,
      // Sent only when they actually moved it, so an untouched map never
      // overwrites a good fix with a coordinate nobody chose.
      pin: pin ?? undefined,
      address: address.trim() || undefined,
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

  /** Clear everything from the last report so a new one starts empty. */
  function resetForNewReport() {
    setPhase("compose");
    setText("");
    setAudio(null);
    setImage(null);
    setExtraction(null);
    setQuestions([]);
    setAnswers({});
    setReportId(null);
    setPin(null);
    setAddress("");
    setError(null);
    setSilentMic(false);
    setPhotoDropped(false);
    setTab("report");
  }

  const hasContent = text.trim() !== "" || audio !== null || image !== null;

  if (profile === null) {
    return <main className="min-h-screen bg-day" aria-busy="true" />;
  }

  if (!profile.onboarded) {
    return (
      <Onboarding
        onDone={(p) => {
          setProfile(p);
          if (p.permissionsAsked) getLocation();
        }}
      />
    );
  }

  const settled = phase === "compose" || phase === "error" || phase === "done" || phase === "queued";
  const t = stringsFor(profile.lang);

  function setLang(lang: Lang) {
    const next = { ...profile!, lang };
    setProfile(next);
    saveProfile(next);
  }

  /**
   * The three ways to add evidence, side by side under the text box.
   *
   * They were previously full-width stacked rows, which pushed the send button off
   * a phone screen and made three optional attachments look like three required
   * steps. As icons they read as what they are: things you may add.
   */
  const attachments = [
    {
      key: "mic",
      label: t.attachVoice,
      active: recording,
      done: audio !== null && !recording,
      onClick: recording ? stopRecording : startRecording,
      icon: (
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z" />
      ),
    },
    {
      key: "photo",
      label: t.attachPhoto,
      active: false,
      done: image !== null,
      icon: (
        <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      ),
    },
    {
      key: "location",
      label: t.attachLocation,
      active: locating,
      done: coords !== null,
      onClick: getLocation,
      icon: (
        <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
      ),
    },
  ];

  const visibleQuestions = address.trim()
    ? questions.filter((q) => q.field !== "location")
    : questions;

  const locationStatus = coords
    ? coords.accuracy > 0
      ? t.locationAttachedTo(coords.accuracy)
      : t.locationAttached
    : locating
      ? t.findingYou
      : locationDenied
        ? t.locationUnavailable
        : null;

  return (
    <main dir={t.dir} className="min-h-screen bg-day text-ink">
      <div className="mx-auto max-w-xl px-5 py-6">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mark className="h-7 w-7 shrink-0 text-brand" />
              <h1 className="text-2xl font-bold tracking-tight text-brand">AmanSignal</h1>
            </div>
            <p className={`${t.face} mt-1 text-lg font-semibold`}>{t.headerAction}</p>
          </div>
          <LanguageToggle lang={profile.lang} onChange={setLang} />
        </header>

        {/* Reporting and following up are the two things a person does here, and
            the second is what keeps a report from feeling like it vanished. The
            switch is hidden mid-report so nobody navigates away from one they have
            not confirmed yet. */}
        {settled ? (
          <nav className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-day-surface p-1 ring-1 ring-day-line">
            {([
              ["report", t.tabReport],
              ["mine", t.tabMine],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key}
                className={`${t.face} rounded-xl px-4 py-3 text-center text-base font-semibold ${
                  tab === key ? "bg-brand text-white" : "text-ink-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : null}

        {settled && tab === "mine" ? (
          <MyReports reporterId={profile.reporterId} lang={profile.lang} />
        ) : null}

        {settled && (pending > 0 || flushing || flushNote) ? (
          <div
            role="status"
            className={`${t.face} mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${
              flushNote
                ? "bg-ok/10 text-ok ring-ok"
                : "bg-amber-50 text-amber-900 ring-amber-200"
            }`}
          >
            {flushing ? t.sendingPending : (flushNote ?? t.pendingCount(pending))}
          </div>
        ) : null}

        {tab === "report" && phase === "queued" ? (
          <div className="rounded-2xl bg-day-surface p-8 text-center ring-1 ring-amber-200">
            <p className={`${t.face} text-xl font-bold text-amber-900`}>{t.savedOffline}</p>
            <p className={`${t.face} mt-2 text-ink-soft`}>{t.savedOfflineHint}</p>
            <button
              type="button"
              onClick={resetForNewReport}
              className={`${t.face} mt-6 rounded-xl bg-brand px-5 py-4 text-base font-semibold text-white`}
            >
              {t.sendAnother}
            </button>
          </div>
        ) : null}

        {tab === "report" && (phase === "compose" || phase === "error") ? (
          <div className="space-y-5">
            <section className="rounded-2xl bg-day-surface p-5 shadow-sm ring-1 ring-day-line">
              <label htmlFor="report" className={`${t.face} block text-base font-semibold`}>
                {t.whatHappened}
              </label>
              <textarea
                id="report"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (e.target.value.length === 1) startComposing();
                }}
                rows={5}
                dir="auto"
                placeholder={t.composePlaceholder}
                className={`${t.fieldFace} mt-3 w-full rounded-xl border border-day-line p-4 text-lg leading-relaxed outline-none focus:border-brand`}
              />

              <div className="mt-3 grid grid-cols-3 gap-2">
                {attachments.map((a) =>
                  a.key === "photo" ? (
                    <label
                      key={a.key}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-3 ring-1 transition-colors ${
                        a.done ? "bg-brand/10 text-brand ring-brand" : "bg-day text-ink-soft ring-day-line"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 fill-current">
                        {a.icon}
                      </svg>
                      <span className={`${t.face} text-center text-xs font-medium leading-tight`}>
                        {a.label}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={async (e) => {
                          const picked = e.target.files?.[0] ?? null;
                          startComposing();
                          if (!picked) {
                            setImage(null);
                            return;
                          }
                          // Converted here rather than sent as-is: iPhones write
                          // HEIC and Android increasingly writes AVIF, neither of
                          // which the model reads. This also shrinks an 8MP photo
                          // before it crosses a congested network.
                          const { file } = await normaliseImage(picked);
                          setImage(file);
                        }}
                      />
                    </label>
                  ) : (
                    <button
                      key={a.key}
                      type="button"
                      onClick={a.onClick}
                      aria-pressed={a.active}
                      className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 ring-1 transition-colors ${
                        a.active
                          ? "bg-critical text-white ring-critical"
                          : a.done
                            ? "bg-brand/10 text-brand ring-brand"
                            : "bg-day text-ink-soft ring-day-line"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 fill-current">
                        {a.icon}
                      </svg>
                      <span className={`${t.face} text-center text-xs font-medium leading-tight`}>
                        {a.key === "mic" && recording ? t.stopRecording : a.label}
                      </span>
                    </button>
                  ),
                )}
              </div>

              <div className={`${t.face} mt-2 space-y-1 text-sm`}>
                {audio && !recording ? <p className="text-ok">{t.voiceAttached}</p> : null}
                {image ? <p className="text-ok">{t.photoAttached}</p> : null}
                {locationStatus ? (
                  <p className={coords ? "text-ok" : "text-ink-soft"}>{locationStatus}</p>
                ) : null}
              </div>
            </section>

            {silentMic && !recording ? (
              <div role="alert" className="rounded-xl bg-red-50 p-4 ring-1 ring-critical">
                <p className={`${t.face} text-base font-semibold text-critical`}>{t.silentMicTitle}</p>
                <p className={`${t.face} mt-1 text-sm text-ink`}>{t.silentMicBody}</p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-critical">{error}</p>
            ) : null}

            <button
              type="button"
              disabled={!hasContent}
              onClick={submit}
              className={`${t.face} w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white disabled:bg-slate-300`}
            >
              {t.sendReport}
            </button>
          </div>
        ) : null}

        {phase === "sending" ? (
          <div className="rounded-2xl bg-day-surface p-8 text-center ring-1 ring-day-line">
            <p className={`${t.face} text-lg font-semibold`}>{t.understanding}</p>
            <p className={`${t.face} mt-2 text-sm text-ink-soft`}>{t.understandingHint}</p>
          </div>
        ) : null}

        {phase === "review" && extraction ? (
          <div className="space-y-5">
            <ReviewCard
              extraction={extraction}
              onChange={setExtraction}
              lang={profile.lang}
              t={t}
              onSpeak={speak}
              speaking={speaking}
              spoken={spokenSummary(extraction)}
            />

            {photoDropped ? (
              <p role="status" className={`${t.face} rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200`}>
                {t.photoUnreadable}
              </p>
            ) : null}

            <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-day-line">
              <LocationPin
                lat={pin?.lat ?? coords?.lat ?? null}
                lon={pin?.lon ?? coords?.lon ?? null}
                accuracy={pin ? null : (coords?.accuracy ?? null)}
                onChange={(lat, lon) => setPin({ lat, lon })}
                onUseGps={requestLocation}
                address={address}
                onAddressChange={setAddress}
                t={t}
              />
            </section>

            {/* A location question asked directly under the address they just
                wrote reads as not having been listened to. The question was
                chosen before the address existed, so it is dropped once it does. */}
            {visibleQuestions.length ? (
              <section className="rounded-2xl bg-day-surface p-5 ring-1 ring-brand">
                <h2 className={`${t.face} text-lg font-bold`}>{t.oneMoreThing}</h2>
                <p className={`${t.face} mb-4 text-sm text-ink-soft`}>{t.helpsTeam}</p>
                {visibleQuestions.map((q) => (
                  <div key={q.field} className="mb-4">
                    <label htmlFor={`q-${q.field}`} className={`${t.face} block text-base font-semibold`}>
                      {profile!.lang === "ur" ? q.ur : q.en}
                    </label>
                    <input
                      id={`q-${q.field}`}
                      dir="auto"
                      value={answers[q.field] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))}
                      className={`${t.fieldFace} mt-2 w-full rounded-xl border border-day-line p-3 text-lg outline-none focus:border-brand`}
                    />
                  </div>
                ))}
              </section>
            ) : null}

            <button
              type="button"
              onClick={confirmReport}
              className={`${t.face} w-full rounded-2xl bg-brand px-6 py-5 text-xl font-bold text-white`}
            >
              {t.confirmAndSend}
            </button>
          </div>
        ) : null}

        {tab === "report" && phase === "done" ? (
          <div className="rounded-2xl bg-day-surface p-8 text-center ring-1 ring-ok">
            <p className={`${t.face} text-xl font-bold text-ok`}>{t.received}</p>
            <p className={`${t.face} mt-2 text-ink-soft`}>{t.receivedBody}</p>
            {/* Two things follow a report: watching this one, or sending another
                because something else has happened. Neither is the obvious default,
                so both are offered rather than guessed at. */}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTab("mine")}
                className={`${t.face} rounded-xl bg-brand px-5 py-4 text-base font-semibold text-white`}
              >
                {t.viewMyReport}
              </button>
              <button
                type="button"
                onClick={resetForNewReport}
                className={`${t.face} rounded-xl bg-day px-5 py-4 text-base font-semibold text-brand ring-1 ring-brand`}
              >
                {t.sendAnother}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
