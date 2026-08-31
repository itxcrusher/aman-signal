import type { Lang } from "./i18n";

/**
 * The operator board's own vocabulary, and its own language preference.
 *
 * Kept separate from the citizen strings for two reasons. The words differ: a
 * reporter is never shown "deduplication", "audit trail" or "distinct reports",
 * and an operator is never told "help is on its way". And the preference itself
 * is separate, because the two surfaces are used by different people on
 * different devices; a control room running in Urdu says nothing about what a
 * reporter chose on their phone, and sharing one setting would have each
 * overwrite the other.
 *
 * The board is dense and scanned rather than read, so Urdu here uses the same
 * Nastaliq face at the same 18px floor as the citizen app. That costs vertical
 * space on a screen built for density, which is a real trade and the reason the
 * default stays English: an operator who wants Urdu chooses it deliberately.
 */

export type OpsStrings = {
  dir: "rtl" | "ltr";
  face: string;

  operations: string;
  controlRoom: string;
  change: string;
  changeTeam: string;

  setupIntro: string;
  yourName: string;
  yourNameWhy: string;
  namePlaceholder: string;
  organisation: string;
  optional: string;
  orgPlaceholder: string;
  yourDistrict: string;
  yourDistrictWhy: string;
  searchDistricts: string;
  noDistrictMatch: string;
  openBoard: string;
  cancel: string;
  needNameAndDistrict: string;

  incidentMap: string;
  markerNote: string;
  loading: string;
  nothingOpen: string;
  nothingOpenWhy: string;
  elsewhereCount: (n: number, district: string) => string;
  showingCount: (n: number, district: string, elsewhere: number) => string;

  needsJudgement: string;
  needsJudgementWhy: string;
  needsReading: string;
  needsReadingWhy: string;
  nothingReadable: string;
  whatItSays: string;
  whatItSaysPlaceholder: string;
  readingIsYours: string;
  readAndEnter: string;
  createFromReading: string;
  notAnEmergency: string;
  orderedBy: string;
  resembles: string;
  sameIncident: string;
  separateEmergency: string;

  markVerified: string;
  markAssigned: string;
  markResponding: string;
  markResolved: string;
  viewDetails: string;
  closeDetails: string;
  editIncident: string;
  saveChanges: string;
  editedNote: string;

  situation: string;
  peopleAffected: string;
  vulnerable: string;
  roadAccess: string;
  summary: string;
  location: string;
  completeness: string;
  distinctReports: string;
  citizenConfirmed: string;
  disputed: string;
  team: string;
  reporterSaysSafe: string;
  sentFromOutbox: string;

  underlyingReports: string;
  reporter: string;
  notGiven: string;
  asked: string;
  stillUnknown: string;
  repairs: string;
  auditTrail: string;
  voiceNote: string;
  photo: string;
  typed: string;
  pinPlacedByReporter: string;
  noReportsYet: string;

  whichTeam: string;
  teamPlaceholder: string;
  handOverTo: string;
  enterNameFirst: string;
};

const en: OpsStrings = {
  dir: "ltr",
  face: "",

  operations: "Operations",
  controlRoom: "control room",
  change: "Change",
  changeTeam: "Change team",

  setupIntro:
    "This board shows the incidents for one district. Reports are reconciled into incidents automatically; every decision about them is yours.",
  yourName: "Your name",
  yourNameWhy:
    "Recorded against every verification, assignment and duplicate decision you make. The audit trail has to be able to answer who decided what.",
  namePlaceholder: "e.g. Hassaan Javed",
  organisation: "Organisation",
  optional: "optional",
  orgPlaceholder: "e.g. Alkhidmat, Rescue 1122, District Administration",
  yourDistrict: "Your district",
  yourDistrictWhy:
    "You will see incidents in this district, plus any the system could not place. Reports from elsewhere belong to another control room.",
  searchDistricts: "Search districts...",
  noDistrictMatch: "No district matches that.",
  openBoard: "Open the board",
  cancel: "Cancel",
  needNameAndDistrict: "Enter your name and pick a district to continue.",

  incidentMap: "Incident map",
  markerNote: "Marker size shows how many reports back an incident.",
  loading: "Loading incidents...",
  nothingOpen: "Nothing open in",
  nothingOpenWhy: "Confirmed citizen reports from this district appear here as incidents.",
  elsewhereCount: (n, d) =>
    `${n} incident${n === 1 ? " is" : "s are"} open in other districts, handled by their own control rooms.`,
  showingCount: (n, d, e) =>
    `Showing ${n} in ${d}. ${e} elsewhere ${e === 1 ? "is" : "are"} handled by another control room.`,

  needsJudgement: "Needs your judgement",
  needsJudgementWhy:
    "These reports resemble an existing incident, but not closely enough to link automatically. They are held rather than merged, because a wrong merge hides an emergency.",
  needsReading: "Could not be read automatically",
  needsReadingWhy:
    "Someone sent these and the model could not understand them. The recording and the photo are intact, so a person can. Nothing here has been interpreted yet, and nothing is on the board until you read it.",
  nothingReadable: "Nothing was attached that can be read. Contact the reporter if you have a number.",
  whatItSays: "What it says",
  whatItSaysPlaceholder: "Write what you heard or saw, in your own words.",
  readingIsYours:
    "This becomes the incident, recorded as your reading rather than the system's. The original report is kept exactly as it was sent.",
  readAndEnter: "Read it and enter what it says",
  createFromReading: "Create incident from this",
  notAnEmergency: "Not an emergency",
  orderedBy:
    "Ordered by how many urgency indicators are present and how many reports mention them. It is a scanning aid, not a response priority: that is yours to decide.",
  resembles: "Resembles",
  sameIncident: "Same incident",
  separateEmergency: "This is a separate emergency",

  markVerified: "Mark verified",
  markAssigned: "Mark assigned",
  markResponding: "Mark responding",
  markResolved: "Mark resolved",
  viewDetails: "View details",
  closeDetails: "Close",
  editIncident: "Edit",
  saveChanges: "Save changes",
  editedNote: "Edits change the incident, which is the interpretation. The underlying reports are evidence and are never altered.",

  situation: "Situation",
  peopleAffected: "People affected",
  vulnerable: "Vulnerable people",
  roadAccess: "Road access",
  summary: "Summary",
  location: "Location",
  completeness: "Completeness",
  distinctReports: "Distinct reports",
  citizenConfirmed: "Citizen-confirmed",
  disputed: "disputed",
  team: "Team",
  reporterSaysSafe: "Reporter says they are safe",
  sentFromOutbox: "sent offline, unverified by reporter",

  underlyingReports: "Underlying reports",
  reporter: "Reporter",
  notGiven: "not given",
  asked: "Asked",
  stillUnknown: "Still unknown",
  repairs: "Schema repairs",
  auditTrail: "Audit trail",
  voiceNote: "voice note",
  photo: "photo",
  typed: "typed",
  pinPlacedByReporter: "pin placed by reporter",
  noReportsYet: "No reports attached yet.",

  whichTeam: "Which team?",
  teamPlaceholder: "e.g. Boat Team 3",
  handOverTo: "Hand over to which team?",
  enterNameFirst: "Enter your name first: every decision is recorded against a person.",
};

const ur: OpsStrings = {
  dir: "rtl",
  face: "urdu-ui",

  operations: "آپریشنز",
  controlRoom: "کنٹرول روم",
  change: "تبدیل کریں",
  changeTeam: "ٹیم تبدیل کریں",

  setupIntro:
    "یہ بورڈ ایک ضلع کی اطلاعات دکھاتا ہے۔ اطلاعات خودکار طور پر ایک واقعے میں جوڑ دی جاتی ہیں؛ ہر فیصلہ آپ کا ہے۔",
  yourName: "آپ کا نام",
  yourNameWhy:
    "آپ کی ہر تصدیق، ٹیم کی تعیناتی اور دہرائی کے فیصلے کے ساتھ درج ہوگا۔ ریکارڈ سے یہ معلوم ہونا چاہیے کہ فیصلہ کس نے کیا۔",
  namePlaceholder: "مثال: حسان جاوید",
  organisation: "ادارہ",
  optional: "اختیاری",
  orgPlaceholder: "مثال: الخدمت، ریسکیو 1122، ضلعی انتظامیہ",
  yourDistrict: "آپ کا ضلع",
  yourDistrictWhy:
    "آپ کو اسی ضلع کی اطلاعات نظر آئیں گی، اور وہ بھی جن کی جگہ معلوم نہیں ہو سکی۔ باقی اضلاع کی اطلاعات ان کے اپنے کنٹرول روم کی ذمہ داری ہیں۔",
  searchDistricts: "ضلع تلاش کریں...",
  noDistrictMatch: "کوئی ضلع نہیں ملا۔",
  openBoard: "بورڈ کھولیں",
  cancel: "منسوخ کریں",
  needNameAndDistrict: "جاری رکھنے کے لیے اپنا نام لکھیں اور ضلع منتخب کریں۔",

  incidentMap: "واقعات کا نقشہ",
  markerNote: "نشان کا حجم بتاتا ہے کہ کتنی اطلاعات ایک واقعے کی تصدیق کرتی ہیں۔",
  loading: "اطلاعات کھل رہی ہیں...",
  nothingOpen: "کوئی کھلا واقعہ نہیں:",
  nothingOpenWhy: "اس ضلع کی تصدیق شدہ اطلاعات یہاں واقعات کے طور پر نظر آئیں گی۔",
  elsewhereCount: (n) => `${n} واقعات دوسرے اضلاع میں کھلے ہیں، جو ان کے اپنے کنٹرول روم دیکھ رہے ہیں۔`,
  showingCount: (n, d, e) => `${d} میں ${n} دکھائے جا رہے ہیں۔ ${e} دوسرے اضلاع میں ہیں۔`,

  needsJudgement: "آپ کے فیصلے کی ضرورت",
  needsJudgementWhy:
    "یہ اطلاعات کسی موجودہ واقعے سے ملتی جلتی ہیں، مگر اتنی نہیں کہ خودکار طور پر جوڑ دی جائیں۔ انہیں روکا گیا ہے، کیونکہ غلط جوڑ ایک ہنگامی صورتحال چھپا دیتا ہے۔",
  needsReading: "خودکار طور پر پڑھی نہیں جا سکیں",
  needsReadingWhy:
    "یہ اطلاعات کسی نے بھیجی ہیں مگر نظام انہیں سمجھ نہیں سکا۔ آواز اور تصویر محفوظ ہیں، اس لیے ایک انسان انہیں پڑھ سکتا ہے۔ جب تک آپ انہیں نہ پڑھیں، یہ بورڈ پر نہیں آئیں گی۔",
  nothingReadable: "کوئی ایسی چیز منسلک نہیں جو پڑھی جا سکے۔ اگر نمبر موجود ہے تو رابطہ کریں۔",
  whatItSays: "اس میں کیا کہا گیا ہے",
  whatItSaysPlaceholder: "جو آپ نے سنا یا دیکھا، اپنے الفاظ میں لکھیں۔",
  readingIsYours:
    "یہی واقعہ بنے گا، اور یہ آپ کی پڑھت کے طور پر درج ہوگا، نظام کی نہیں۔ اصل اطلاع جوں کی توں محفوظ رہے گی۔",
  readAndEnter: "پڑھ کر تفصیل درج کریں",
  createFromReading: "اس سے واقعہ بنائیں",
  notAnEmergency: "یہ ہنگامی صورتحال نہیں",
  orderedBy:
    "ترتیب اس بنیاد پر ہے کہ کتنی ہنگامی علامات موجود ہیں اور کتنی اطلاعات ان کی تصدیق کرتی ہیں۔ یہ صرف دیکھنے میں آسانی کے لیے ہے، ترجیح کا فیصلہ آپ کا ہے۔",
  resembles: "مشابہت",
  sameIncident: "یہی واقعہ ہے",
  separateEmergency: "یہ الگ ہنگامی صورتحال ہے",

  markVerified: "تصدیق شدہ",
  markAssigned: "ٹیم مقرر",
  markResponding: "ٹیم روانہ",
  markResolved: "مکمل",
  viewDetails: "تفصیل دیکھیں",
  closeDetails: "بند کریں",
  editIncident: "درست کریں",
  saveChanges: "محفوظ کریں",
  editedNote: "تبدیلی واقعے میں ہوتی ہے، جو ہماری تعبیر ہے۔ اصل اطلاعات شہادت ہیں اور کبھی تبدیل نہیں کی جاتیں۔",

  situation: "صورتحال",
  peopleAffected: "متاثرہ افراد",
  vulnerable: "کمزور افراد",
  roadAccess: "راستے کی حالت",
  summary: "خلاصہ",
  location: "جگہ",
  completeness: "مکمل معلومات",
  distinctReports: "الگ اطلاعات",
  citizenConfirmed: "شہری تصدیق شدہ",
  disputed: "اختلاف",
  team: "ٹیم",
  reporterSaysSafe: "اطلاع دینے والے نے بتایا کہ وہ محفوظ ہیں",
  sentFromOutbox: "بغیر انٹرنیٹ بھیجی گئی، تصدیق نہیں ہوئی",

  underlyingReports: "بنیادی اطلاعات",
  reporter: "اطلاع دینے والا",
  notGiven: "نہیں بتایا",
  asked: "پوچھا گیا",
  stillUnknown: "ابھی معلوم نہیں",
  repairs: "اسکیما درستیاں",
  auditTrail: "ریکارڈ",
  voiceNote: "آواز",
  photo: "تصویر",
  typed: "لکھا ہوا",
  pinPlacedByReporter: "نشان خود لگایا گیا",
  noReportsYet: "ابھی کوئی اطلاع منسلک نہیں۔",

  whichTeam: "کون سی ٹیم؟",
  teamPlaceholder: "مثال: کشتی ٹیم ۳",
  handOverTo: "کس ٹیم کے حوالے کریں؟",
  enterNameFirst: "پہلے اپنا نام لکھیں: ہر فیصلہ کسی فرد کے نام سے درج ہوتا ہے۔",
};

export const OPS_STRINGS: Record<Lang, OpsStrings> = { ur, en };

/** English by default: the board is dense, and Urdu costs vertical space here. */
export function opsStringsFor(lang: Lang | undefined): OpsStrings {
  return lang === "ur" ? OPS_STRINGS.ur : OPS_STRINGS.en;
}
