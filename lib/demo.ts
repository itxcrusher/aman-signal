/**
 * Whether this deployment is a demonstration.
 *
 * A demonstration deployment publishes its own passphrases on the sign-in pages
 * and marks its board as carrying fictional reports. Neither of those is
 * something the product should ever do by default, so both hang off one
 * explicit flag rather than being written into the pages.
 *
 * The reasoning is worth keeping next to the code. The operator board exists to
 * hold reporters' names, phone numbers, photographs and recordings, and the
 * whole argument for gating it is that those belong to people who did not
 * consent to an audience. A deployment whose reports are invented owes nobody
 * that protection, and making an evaluator guess a passphrase to see the work
 * protects nothing at all. A deployment with real reports on it must never set
 * this.
 */
export function isDemo(): boolean {
  return process.env.AMANSIGNAL_DEMO === "1";
}

/**
 * The passphrase to print on a sign-in page, or null.
 *
 * Returns nothing unless the deployment has declared itself a demonstration.
 * Printing a live credential is the kind of mistake that is one missing check
 * away, so the check is here rather than at each call site.
 */
export function publishedPassphrase(which: "ops" | "field"): string | null {
  if (!isDemo()) return null;
  const value = which === "ops" ? process.env.OPS_PASSPHRASE : process.env.FIELD_PASSPHRASE;
  return value ?? null;
}
