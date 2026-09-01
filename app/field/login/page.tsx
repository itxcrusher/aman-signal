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

export default function FieldLogin() {
  const [passphrase, setPassphrase] = useState("");
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
