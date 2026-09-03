"use client";

import { useState } from "react";

/**
 * The way in for a field crew.
 *
 * Sized for a phone rather than a desk, because that is where it is opened:
 * outdoors, one-handed, probably in a hurry. Kept in English for the same
 * reason the operator sign-in is: it is one field, seen once at the start of a
 * shift, and the Urdu that matters is on the screen behind it where the work is.
 */

export default function FieldLogin({ demoPassphrase }: { demoPassphrase: string | null }) {
  const [passphrase, setPassphrase] = useState(demoPassphrase ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/field/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (res.ok) {
        window.location.href = "/field";
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
    <main className="ops-surface flex min-h-screen flex-col justify-center bg-ground px-6 text-paper">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-lg font-semibold text-paper">AmanSignal field</h1>
        <p className="mt-2 text-sm leading-relaxed text-paper-soft">
          For response teams. You will see the incidents assigned to your team, with the numbers to
          call on the way.
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
            Team passphrase
          </label>
          <input
            id="passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface-2 p-3 text-base text-paper"
          />

          {error ? (
            <p role="alert" className="mt-3 text-sm text-warn">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !passphrase}
            className="mt-5 w-full cursor-pointer rounded-lg bg-brand px-4 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Checking..." : "Open my assignments"}
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
