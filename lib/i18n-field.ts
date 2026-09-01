import type { Lang } from "./i18n";

/**
 * The field crew's vocabulary.
 *
 * Its own table rather than a share of the operator's, because the two are not
 * the same job. An operator reconciles and decides; a crew is standing next to
 * a boat deciding whether to take the truck. So there is no "verify", no
 * "duplicate", no "audit trail" here, and the words that do appear are the ones
 * that change what a crew does in the next ten minutes.
 *
 * Urdu is offered here for the same reason it is offered to reporters: the
 * people doing this work in Pakistan are not, in general, working in English,
 * and a relief app whose Urdu stops at the front door is an English app with a
 * translated entrance.
 */

export type FieldStrings = {
  dir: "rtl" | "ltr";
  face: string;

  fieldTeam: string;
  whichTeam: string;
  whichTeamWhy: string;
  chooseTeam: string;
  noTeamsYet: string;
  noTeamsYetWhy: string;
  change: string;
  signOut: string;

  nothingAssigned: string;
  nothingAssignedWhy: string;
  assignedCount: (n: number) => string;

  situation: string;
  peopleThere: string;
  vulnerable: string;
  roadAccess: string;
  roadDisputed: string;
  whatTheySaid: string;
  whatWeTold: string;
  callThem: string;
  openInMaps: string;
  noLocation: string;
  assignedAt: string;

  onOurWay: string;
  markDone: string;
  reportBack: string;
  reportBackHint: string;
  send: string;
  sending: string;
  saved: string;
  failed: string;

  statusAssigned: string;
  statusResponding: string;
  statusResolved: string;
};

const en: FieldStrings = {
  dir: "ltr",
  face: "",

  fieldTeam: "Field team",
  whichTeam: "Which team are you?",
  whichTeamWhy:
    "You will see only what has been assigned to your team. Every update you send is recorded against it.",
  chooseTeam: "Choose your team",
  noTeamsYet: "Nothing has been assigned to any team yet.",
  noTeamsYetWhy: "When a control room hands an incident to a team, it appears here.",
  change: "Change",
  signOut: "Sign out",

  nothingAssigned: "Nothing assigned to you right now",
  nothingAssignedWhy: "This page updates on its own. Leave it open.",
  assignedCount: (n) => `${n} assigned to you`,

  situation: "Situation",
  peopleThere: "People there",
  vulnerable: "Vulnerable people",
  roadAccess: "Road",
  roadDisputed: "Reports disagree about the road",
  whatTheySaid: "What they said",
  whatWeTold: "What the control room told them",
  callThem: "Call",
  openInMaps: "Open in maps",
  noLocation: "No coordinates. Use the description and call them.",
  assignedAt: "Assigned",

  onOurWay: "We are on our way",
  markDone: "Done here",
  reportBack: "What did you find?",
  reportBackHint:
    "Goes straight to the control room. What you found, what you still need, anything that changes what they should send next.",
  send: "Send",
  sending: "Sending...",
  saved: "Sent to the control room",
  failed: "Could not send. It stays on this screen; try again.",

  statusAssigned: "Assigned",
  statusResponding: "On the way",
  statusResolved: "Done",
};

const ur: FieldStrings = {
  dir: "rtl",
  face: "urdu-ui",

  fieldTeam: "فیلڈ ٹیم",
  whichTeam: "آپ کون سی ٹیم ہیں؟",
  whichTeamWhy:
    "آپ کو صرف وہی نظر آئے گا جو آپ کی ٹیم کے حوالے کیا گیا ہے۔ آپ کی بھیجی گئی ہر اطلاع اسی ٹیم کے نام درج ہوگی۔",
  chooseTeam: "اپنی ٹیم منتخب کریں",
  noTeamsYet: "ابھی کسی ٹیم کو کچھ نہیں سونپا گیا۔",
  noTeamsYetWhy: "جب کنٹرول روم کوئی واقعہ کسی ٹیم کے حوالے کرے گا، وہ یہاں نظر آئے گا۔",
  change: "تبدیل کریں",
  signOut: "باہر نکلیں",

  nothingAssigned: "ابھی آپ کے لیے کوئی کام نہیں",
  nothingAssignedWhy: "یہ صفحہ خود اپ ڈیٹ ہوتا رہے گا۔ اسے کھلا رہنے دیں۔",
  assignedCount: (n) => `${n} آپ کے حوالے`,

  situation: "صورتحال",
  peopleThere: "وہاں موجود افراد",
  vulnerable: "کمزور افراد",
  roadAccess: "راستہ",
  roadDisputed: "راستے کے بارے میں اطلاعات مختلف ہیں",
  whatTheySaid: "انہوں نے کیا بتایا",
  whatWeTold: "کنٹرول روم نے انہیں کیا بتایا",
  callThem: "کال کریں",
  openInMaps: "نقشے میں کھولیں",
  noLocation: "کوئی مقام موجود نہیں۔ تفصیل دیکھیں اور کال کریں۔",
  assignedAt: "سونپا گیا",

  onOurWay: "ہم روانہ ہو رہے ہیں",
  markDone: "یہاں کام مکمل",
  reportBack: "آپ نے وہاں کیا پایا؟",
  reportBackHint:
    "یہ سیدھا کنٹرول روم کو جائے گا۔ آپ نے کیا دیکھا، مزید کیا چاہیے، اور کوئی ایسی بات جو ان کے اگلے فیصلے کو بدل دے۔",
  send: "بھیجیں",
  sending: "بھیجا جا رہا ہے...",
  saved: "کنٹرول روم کو بھیج دیا گیا",
  failed: "نہیں بھیجا جا سکا۔ یہ اسی اسکرین پر محفوظ ہے، دوبارہ کوشش کریں۔",

  statusAssigned: "سونپا گیا",
  statusResponding: "راستے میں",
  statusResolved: "مکمل",
};

export const FIELD_STRINGS: Record<Lang, FieldStrings> = { ur, en };

/**
 * Urdu by default here, unlike the operator board.
 *
 * The board defaults to English because it is dense and scanned by someone at a
 * desk. This is one card at a time on a phone held by someone who is about to
 * get into a boat, so the vertical cost of Nastaliq buys more than it costs.
 */
export function fieldStringsFor(lang: Lang | undefined): FieldStrings {
  return lang === "en" ? FIELD_STRINGS.en : FIELD_STRINGS.ur;
}
