"use client";

/**
 * Who is reporting, without an account.
 *
 * A login is the wrong instrument here. Password recovery during a flood is not a
 * flow anyone completes, and an OTP round trip depends on the same congested
 * network the emergency is straining. What the operators actually need is a way to
 * call the person back, and what the person needs is to see what became of their
 * report. Both are served by a device-scoped id plus an optional phone number.
 *
 * The id is random and stored locally. It identifies a device, not a person, and
 * is never used to authorise anything.
 */

import type { Lang } from "./i18n";

const KEY = "amansignal.profile";

export type Profile = {
  reporterId: string;
  /** Chosen on the first screen, switchable from the header at any time. */
  lang: Lang;
  name: string;
  phone: string;
  /** Whether the person has been through first-run setup at all. */
  onboarded: boolean;
  /** Whether we have already asked for location and microphone once. */
  permissionsAsked: boolean;
};

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through to the manual path below */
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const EMPTY: Profile = {
  reporterId: "",
  lang: "ur",
  name: "",
  phone: "",
  onboarded: false,
  permissionsAsked: false,
};

/**
 * Reading is tolerant by design. Private-mode browsers throw on localStorage and
 * a partially written record should never be the reason someone cannot report, so
 * any failure degrades to a fresh anonymous profile rather than an error.
 */
export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      if (typeof p.reporterId === "string" && p.reporterId.length >= 8) {
        return {
          reporterId: p.reporterId,
          lang: p.lang === "en" ? "en" : "ur",
          name: typeof p.name === "string" ? p.name : "",
          phone: typeof p.phone === "string" ? p.phone : "",
          onboarded: p.onboarded === true,
          permissionsAsked: p.permissionsAsked === true,
        };
      }
    }
    // Legacy first-run marker from before profiles existed. Someone who already
    // completed setup should not be sent through it a second time.
    const legacy = window.localStorage.getItem("amansignal.onboarded") === "1";
    const fresh: Profile = { ...EMPTY, reporterId: newId(), onboarded: legacy, permissionsAsked: legacy };
    saveProfile(fresh);
    return fresh;
  } catch {
    return { ...EMPTY, reporterId: newId() };
  }
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* A browser refusing storage is not a reason to block a report. */
  }
}

/** Pakistani mobile numbers, written the several ways people actually write them. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+92\d{10}$/.test(digits)) return digits;
  if (/^92\d{10}$/.test(digits)) return `+${digits}`;
  if (/^0\d{10}$/.test(digits)) return `+92${digits.slice(1)}`;
  if (/^3\d{9}$/.test(digits)) return `+92${digits}`;
  return input.trim();
}

export function phoneLooksValid(input: string): boolean {
  return /^\+92\d{10}$/.test(normalisePhone(input));
}
