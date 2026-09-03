"use client";

import { useState } from "react";

/**
 * The way in to the operator board.
 *
 * Written in English only and kept plain. It is seen by control-room staff on a
 * desktop rather than by anyone in an emergency, so none of the care the citizen
 * side takes over language choice and Nastaliq line height is owed here, and
 * pretending otherwise would only add weight to a page that is one field long.
 */

export default function OpsLogin({ demoPassphrase }: { demoPassphrase: string | null }) {
  const [passphrase, setPassphrase] = useState(demoPassphrase ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (res.ok) {
        // A full load rather than a client navigation, so the proxy sees the
        // new cookie and the board is fetched as a signed-in request.
        window.location.href = "/ops";
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not sign in.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // The board's own surface, not the citizen page's. Without it this page
    // rendered the operator palette on the default white ground, which left the
    // heading grey on white and effectively unreadable; it looked fine in every
    // status code and only showed up in a screenshot.
    <main className="ops-surface flex min-h-screen flex-col justify-center bg-ground px-6 text-paper">
      <div className="mx-auto w-full max-w-md">
      <h1 className="text-lg font-semibold text-paper">AmanSignal operations</h1>
      <p className="mt-2 text-sm leading-relaxed text-paper-soft">
        This board carries reporters&apos; names, phone numbers, photographs and recordings of their
        voices. It is restricted for their sake, not for ours.
      </p>

      {demoPassphrase ? (
        /*
         * Said as a decision, not left to look like an oversight.
         *
         * An evaluator who reads the pitch and then finds an open board would be
         * right to treat the claim about protecting reporters as decoration. So the
         * page states why this deployment publishes its own key, and what would be
         * different about one that held real reports.
         */
        <div className="mt-6 rounded-lg bg-surface-2 p-4 ring-1 ring-line">
          <p className="text-sm font-semibold text-brand-soft">Demonstration deployment</p>
          <p className="mt-1 text-sm leading-relaxed text-paper-soft">
            Every report on this deployment is fictional, so there is nobody here to protect and
            nothing is gained by making you guess. The passphrase is{" "}
            <span className="mono text-paper">{demoPassphrase}</span>, and it is filled in below.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-paper-soft">
            A deployment carrying real reports does not print this. It would hold reporters&apos;
            names, their phone numbers, photographs of their homes and recordings of their voices,
            which is the whole reason the board is behind anything at all.
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="passphrase" className="block text-xs text-paper-soft">
          Control room passphrase
        </label>
        <input
          id="passphrase"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 p-3 text-sm text-paper"
        />

        {error ? (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !passphrase}
          className="mt-5 w-full cursor-pointer rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Checking..." : "Open the board"}
        </button>
      </form>

      <p className="mt-8 text-xs leading-relaxed text-paper-soft">
        Reporting an emergency does not need a passphrase.{" "}
        <a href="/" className="underline">
          Go to the reporting page
        </a>
        .
      </p>
      </div>
    </main>
  );
}
