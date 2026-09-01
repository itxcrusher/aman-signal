/**
 * One language at a time.
 *
 * Every screen used to carry its Urdu and English text stacked together. It made
 * the app legible to nobody in particular: an Urdu speaker read past a line of
 * English on every element, an English speaker read past the Urdu, and the density
 * doubled for a product meant to be used one-handed under stress. A person picks a
 * language on the first screen and can switch at any time from the header.
 *
 * English strings are written for someone reading English, not translated word for
 * word from the Urdu, and the reverse. Both say the same thing; neither is a gloss.
 */

export type Lang = "ur" | "en";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "ur", label: "اردو" },
  { code: "en", label: "English" },
];

export type Strings = {
  dir: "rtl" | "ltr";
  /** Class applied to body copy, so Urdu gets Nastaliq and English the Latin face. */
  face: string;

  chooseLanguage: string;
  tagline: string;

  yourDetails: string;
  yourDetailsWhy: string;
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;

  permissionsTitle: string;
  permissionsWhy: string;
  permLocation: string;
  permLocationWhy: string;
  permMic: string;
  permMicWhy: string;
  permPrivacy: string;
  allowAndContinue: string;
  requesting: string;
  continueOn: string;
  notNow: string;
  deniedTitleBoth: string;
  deniedTitleLocation: string;
  deniedTitleMic: string;
  deniedStillReport: string;
  deniedTypeInstead: string;
  deniedPinInstead: string;
  deniedTurnOnLater: string;

  tabReport: string;
  tabMine: string;
  headerAction: string;

  whatHappened: string;
  composePlaceholder: string;
  recordVoice: string;
  /** Icon-row labels. Short by necessity: a full sentence under a 110px
      icon wraps to two lines and makes three tiles different heights. */
  attachVoice: string;
  attachPhoto: string;
  attachLocation: string;
  stopRecording: string;
  recordingTapToStop: string;
  voiceAttached: string;
  silentMicTitle: string;
  silentMicBody: string;
  addPhoto: string;
  photoAttached: string;
  shareLocation: string;
  locationAttached: string;
  locationAttachedTo: (m: number) => string;
  findingYou: string;
  locationUnavailable: string;
  sendReport: string;

  understanding: string;
  understandingHint: string;
  /* What a control room has said back to this person. The answer to reporting
     into silence, which is the part of any reporting system people give up on. */
  fromControlRoom: string;
  replyWithUpdate: string;
  /* The face for a control the person types into. Separate from `face` because
     a typed field must follow the direction of whatever they actually wrote. */
  fieldFace: string;
  /* The outbox. A report composed with no network is held, not lost, and the
     reporter is told so in terms of what happens next rather than what failed. */
  savedOffline: string;
  savedOfflineHint: string;
  pendingCount: (n: number) => string;
  sendingPending: string;
  pendingSent: (n: number) => string;
  /* Failures, said in terms of what the person can do next. The upstream text is
     never shown: "InternalError.Algo.InvalidParameter" helps nobody. */
  errorPhoto: string;
  errorService: string;
  errorNetwork: string;
  errorGeneric: string;
  photoUnreadable: string;
  photoConverted: string;

  weUnderstood: string;
  correctIt: string;
  listen: string;
  playing: string;
  situation: string;
  peopleAffected: string;
  vulnerablePresent: string;
  whatWeHeard: string;
  edit: string;
  doneEditing: string;
  addDetail: string;
  removeItem: string;
  oneMoreThing: string;
  helpsTeam: string;
  confirmAndSend: string;

  received: string;
  receivedBody: string;
  viewMyReport: string;
  sendAnother: string;

  confirmPlace: string;
  dragPin: string;
  tapMap: string;
  pinPlaced: string;
  fromPhone: (m: number | null) => string;
  noLocationYet: string;
  useMyLocation: string;
  locating: string;
  /* Written location, for anyone whose GPS is unavailable, denied, or simply
     wrong. The map alone is not enough: someone who cannot find their own street
     on an unfamiliar map has no way to say where they are at all. */
  findYourArea: string;
  areaPlaceholder: string;
  noAreaMatch: string;
  placeIntro: string;
  addressLabel: string;
  addressHint: string;
  addressSaved: string;
  addressOnly: string;
  findOnMap: string;
  searchingMap: string;
  geocodeNone: string;
  geocodePick: string;
  geocodeWarn: string;
  orPlaceOnMap: string;
  pinFromAddress: string;

  myReportsEmpty: string;
  myReportsEmptyBody: string;
  myReportsFailed: string;
  myReportsFailedBody: string;
  tryAgain: string;
  team: string;
  /* Adding to a report already sent. Not an edit: the first message stays,
     because an operator acted on it and needs it to still exist. */
  cancel: string;
  addUpdate: string;
  addUpdateHint: string;
  updatePlaceholder: string;
  sendUpdate: string;
  sendingUpdate: string;
  updateSent: string;
  updateTooEarly: string;
  updateFailed: string;
  markSafeTitle: string;
  markSafeBody: string;
  markSafe: string;
  markingSafe: string;
  safeConfirmed: string;
  undoSafe: string;
  stateNotReviewed: string;
  stateNew: string;
  stateVerified: string;
  stateAssigned: string;
  stateResponding: string;
  stateResolved: string;
  stateSafe: string;
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  attachedVoice: string;
  attachedPhoto: string;
  attachedLocation: string;
  attachedNoLocation: string;
};

const ur: Strings = {
  dir: "rtl",
  face: "urdu-ui",

  chooseLanguage: "اپنی زبان منتخب کریں",
  tagline: "ہنگامی اطلاع، آپ کی اپنی زبان میں",

  yourDetails: "آپ کی معلومات",
  yourDetailsWhy:
    "تاکہ ریسکیو ٹیم آپ سے رابطہ کر سکے۔ لازمی نہیں، مگر آپ تک پہنچنے کا سب سے تیز راستہ یہی ہے۔",
  nameLabel: "نام",
  namePlaceholder: "آپ کا نام",
  phoneLabel: "موبائل نمبر",
  phonePlaceholder: "03XX XXXXXXX",

  permissionsTitle: "لوکیشن اور مائیکروفون",
  permissionsWhy:
    "ابھی اجازت دے دیں تو ہنگامی وقت میں صرف ایک بار دبانا ہوگا اور آواز میں بتانا ہوگا، کوئی سوال بیچ میں نہیں آئے گا۔",
  permLocation: "اپنی جگہ (لوکیشن)",
  permLocationWhy: "تاکہ ٹیم آپ تک پہنچ سکے اور آپ کو جگہ بتانی نہ پڑے۔",
  permMic: "مائیکروفون",
  permMicWhy: "تاکہ آپ لکھنے کے بجائے بول کر بتا سکیں۔",
  permPrivacy:
    "آپ کی لوکیشن صرف اطلاع بھیجتے وقت پڑھی جاتی ہے، اور مائیکروفون صرف ریکارڈنگ کے دوران۔",
  allowAndContinue: "اجازت دیں اور جاری رکھیں",
  requesting: "اجازت لی جا رہی ہے...",
  continueOn: "جاری رکھیں",
  notNow: "ابھی نہیں، میں خود لکھ کر بھیجوں گا",
  deniedTitleBoth: "کوئی اجازت نہیں ملی",
  deniedTitleLocation: "لوکیشن کی اجازت نہیں ملی",
  deniedTitleMic: "مائیکروفون کی اجازت نہیں ملی",
  deniedStillReport: "آپ پھر بھی اطلاع دے سکتے ہیں۔",
  deniedTypeInstead: "بول کر بتانے کے بجائے لکھ کر بتائیں۔",
  deniedPinInstead: "نقشے پر اپنی جگہ خود لگا دیں۔",
  deniedTurnOnLater: "بعد میں پتے کے ساتھ والے تالے سے یہ اجازتیں دے سکتے ہیں۔",

  tabReport: "اطلاع دیں",
  tabMine: "میری اطلاعات",
  headerAction: "ہنگامی اطلاع دیں",

  whatHappened: "کیا ہوا ہے؟ اردو، رومن اردو یا انگریزی میں لکھیں۔",
  composePlaceholder: "مثال: ہمارے گھر میں پانی آ گیا ہے...",
  recordVoice: "آواز میں بتائیں",
  attachVoice: "آواز",
  attachPhoto: "تصویر",
  attachLocation: "جگہ",
  stopRecording: "روکیں",
  recordingTapToStop: "ریکارڈنگ جاری ہے، روکنے کے لیے دبائیں",
  voiceAttached: "آواز لگ گئی ہے",
  silentMicTitle: "آپ کی آواز سنائی نہیں دی",
  silentMicBody:
    "کچھ بھی ریکارڈ نہیں ہوا، یعنی مائیکروفون بند ہے یا غلط منتخب ہے۔ اسے دیکھ کر دوبارہ ریکارڈ کریں، یا لکھ کر بتائیں۔ ہم خالی ریکارڈنگ نہیں بھیجیں گے۔",
  addPhoto: "تصویر لگائیں",
  photoAttached: "تصویر لگ گئی ہے",
  shareLocation: "اپنی جگہ بھیجیں",
  locationAttached: "جگہ لگ گئی ہے",
  locationAttachedTo: (m) => `جگہ لگ گئی ہے (تقریباً ${m} میٹر تک درست)`,
  findingYou: "آپ کی جگہ تلاش کی جا رہی ہے...",
  locationUnavailable: "جگہ نہیں مل سکی، دوبارہ کوشش کے لیے دبائیں",
  sendReport: "اطلاع بھیجیں",

  understanding: "آپ کی اطلاع پڑھی جا رہی ہے...",
  understandingHint: "اس میں چند سیکنڈ لگتے ہیں۔",
  fieldFace: "urdu-field",
  fromControlRoom: "کنٹرول روم کی طرف سے",
  replyWithUpdate:
    "جواب دینے کے لیے نیچے اپنی اطلاع میں مزید تفصیل شامل کریں: آواز، تصویر یا لکھ کر۔",
  savedOffline: "انٹرنیٹ نہیں ہے، آپ کی اطلاع محفوظ کر لی گئی ہے",
  savedOfflineHint: "جیسے ہی سگنل آئے گا، یہ خود بخود بھیج دی جائے گی۔ ایپ بند کر دیں تب بھی محفوظ رہے گی۔",
  pendingCount: (n) => `${n} اطلاع بھیجنا باقی ہے`,
  sendingPending: "رکی ہوئی اطلاعات بھیجی جا رہی ہیں...",
  pendingSent: (n) => `${n} رکی ہوئی اطلاع بھیج دی گئی`,
  errorPhoto: "یہ تصویر پڑھی نہیں جا سکی۔ تصویر ہٹا کر دوبارہ بھیجیں، یا کیمرے سے نئی تصویر لیں۔ آپ کی باقی اطلاع محفوظ ہے۔",
  errorService: "ابھی سروس جواب نہیں دے رہی۔ آپ کی اطلاع محفوظ ہے، دوبارہ کوشش کریں۔",
  errorNetwork: "انٹرنیٹ نہیں مل رہا۔ کنکشن دیکھ کر دوبارہ بھیجیں۔",
  errorGeneric: "اطلاع بھیجنے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔",
  photoUnreadable: "تصویر پڑھی نہیں جا سکی، اس لیے شامل نہیں کی گئی۔ آپ کی باقی اطلاع بھیج دی گئی ہے۔",
  photoConverted: "تصویر تیار کر لی گئی ہے",

  weUnderstood: "ہم نے یہ سمجھا",
  correctIt: "اگر کچھ غلط ہے تو یہیں درست کر لیں۔",
  listen: "سنیں",
  playing: "سن رہے ہیں...",
  situation: "صورتحال",
  peopleAffected: "متاثرہ افراد",
  vulnerablePresent: "کمزور افراد موجود ہیں",
  whatWeHeard: "ہم نے یہ سنا",
  edit: "درست کریں",
  doneEditing: "ٹھیک ہے",
  addDetail: "اور شامل کریں",
  removeItem: "ہٹا دیں",
  oneMoreThing: "ایک بات اور",
  helpsTeam: "اس سے ریسکیو ٹیم آپ تک پہنچ سکے گی۔",
  confirmAndSend: "تصدیق کریں اور بھیجیں",

  received: "آپ کی اطلاع موصول ہو گئی ہے",
  receivedBody: "آپ کی اطلاع ریلیف ٹیم تک پہنچا دی گئی ہے۔",
  viewMyReport: "اپنی اطلاع دیکھیں",
  sendAnother: "نئی اطلاع بھیجیں",

  confirmPlace: "جگہ کی تصدیق کریں",
  dragPin: "نشان کو کھینچ کر بالکل ٹھیک جگہ پر رکھیں۔ فون کی لوکیشن اکثر آدھی گلی کا فرق دکھاتی ہے۔",
  tapMap: "نقشے پر دبا کر اپنی جگہ لگائیں۔",
  pinPlaced: "آپ نے جگہ خود لگائی ہے",
  fromPhone: (m) => (m === null ? "فون کی لوکیشن" : `فون کی لوکیشن، تقریباً ${m} میٹر تک درست`),
  noLocationYet: "ابھی کوئی جگہ نہیں لگی",
  useMyLocation: "میری جگہ لے لیں",
  locating: "تلاش جاری ہے...",
  findYourArea: "اپنا شہر یا ضلع تلاش کریں",
  areaPlaceholder: "مثال: ٹوبہ ٹیک سنگھ",
  noAreaMatch: "کوئی شہر نہیں ملا",
  placeIntro: "ٹیم کو آپ تک پہنچنے کے لیے یہ ضروری ہے۔",
  addressLabel: "اپنا پتہ لکھیں",
  addressHint: "محلہ، گلی، اور قریبی نشانی جیسے مسجد یا اسکول",
  addressSaved: "پتہ لکھا جا چکا ہے",
  addressOnly: "پتہ لکھا ہے، نقشے پر نشان نہیں",
  findOnMap: "نقشے پر تلاش کریں",
  searchingMap: "تلاش ہو رہی ہے...",
  geocodeNone: "یہ پتہ نقشے پر نہیں ملا۔ فکر نہ کریں، آپ کا لکھا ہوا پتہ پھر بھی ٹیم تک پہنچے گا۔",
  geocodePick: "کیا ان میں سے کوئی درست ہے؟ دبا کر نشان لگائیں۔",
  geocodeWarn: "خودکار تلاش غلط بھی ہو سکتی ہے۔ نشان لگانے سے پہلے نقشے پر دیکھ لیں۔",
  orPlaceOnMap: "یا نقشے پر خود نشان لگائیں",
  pinFromAddress: "پتے سے نشان لگایا گیا",

  myReportsEmpty: "ابھی تک آپ نے کوئی اطلاع نہیں بھیجی",
  myReportsEmptyBody:
    "آپ جو بھی اطلاع بھیجیں گے وہ یہاں نظر آئے گی، اور ساتھ یہ بھی کہ کنٹرول روم نے اس پر کیا کیا۔",
  myReportsFailed: "آپ کی اطلاعات نہیں کھل سکیں",
  myReportsFailedBody: "اپنا انٹرنیٹ دیکھ کر دوبارہ کوشش کریں۔",
  tryAgain: "دوبارہ کوشش کریں",
  team: "ٹیم",
  cancel: "منسوخ کریں",
  addUpdate: "نئی بات بتائیں",
  addUpdateHint: "جو پہلے بھیجا وہ ویسا ہی رہے گا۔ یہ اس کے ساتھ شامل ہو جائے گا۔",
  updatePlaceholder: "مثال: پانی اور بڑھ گیا ہے، ہم چھت پر آ گئے ہیں",
  sendUpdate: "بھیجیں",
  sendingUpdate: "بھیجا جا رہا ہے...",
  updateSent: "آپ کی نئی بات ٹیم تک پہنچا دی گئی ہے",
  updateTooEarly: "آپ کی پہلی اطلاع کا ابھی جائزہ لیا جا رہا ہے۔ تھوڑی دیر بعد کوشش کریں۔",
  updateFailed: "بھیجی نہیں جا سکی۔ دوبارہ کوشش کریں۔",
  markSafeTitle: "کیا اب آپ محفوظ ہیں؟",
  markSafeBody:
    "اگر مدد پہنچ گئی ہے یا اب خطرہ نہیں رہا تو بتا دیں۔ کنٹرول روم کو پتہ چل جائے گا کہ ٹیم کہیں اور جا سکتی ہے۔",
  markSafe: "میں اب محفوظ ہوں",
  markingSafe: "بھیجا جا رہا ہے...",
  safeConfirmed: "آپ نے بتایا کہ آپ محفوظ ہیں",
  undoSafe: "یہ غلطی سے ہوا، واپس لیں",
  stateNotReviewed: "موصول ہو گئی، ابھی دیکھی نہیں گئی",
  stateNew: "موصول ہو گئی، جائزہ باقی ہے",
  stateVerified: "تصدیق ہو گئی",
  stateAssigned: "ٹیم مقرر کر دی گئی ہے",
  stateResponding: "ٹیم راستے میں ہے",
  stateResolved: "مکمل ہو گیا",
  stateSafe: "آپ نے بتایا کہ آپ محفوظ ہیں",
  justNow: "ابھی",
  minutesAgo: (n) => `${n} منٹ پہلے`,
  hoursAgo: (n) => `${n} گھنٹے پہلے`,
  daysAgo: (n) => `${n} دن پہلے`,
  attachedVoice: "آواز",
  attachedPhoto: "تصویر",
  attachedLocation: "جگہ لگی ہوئی ہے",
  attachedNoLocation: "جگہ نہیں لگی",
};

const en: Strings = {
  dir: "ltr",
  face: "en",

  chooseLanguage: "Choose your language",
  tagline: "Emergency reporting, in your own language.",

  yourDetails: "Your details",
  yourDetailsWhy:
    "So a rescue team can call you back. Optional, but it is the fastest way for someone to reach you.",
  nameLabel: "Name",
  namePlaceholder: "Your name",
  phoneLabel: "Mobile number",
  phonePlaceholder: "03XX XXXXXXX",

  permissionsTitle: "Location and microphone",
  permissionsWhy:
    "Recommended. Grant them now and reporting later takes one tap and your voice, with no prompts while you are dealing with an emergency.",
  permLocation: "Your location",
  permLocationWhy: "So a team can reach you without you having to explain where you are.",
  permMic: "Microphone",
  permMicWhy: "So you can speak your report instead of typing it.",
  permPrivacy:
    "Your location is only read when you send a report, and the microphone only while you are recording one.",
  allowAndContinue: "Allow and continue",
  requesting: "Requesting...",
  continueOn: "Continue",
  notNow: "Not now, I will type my report",
  deniedTitleBoth: "Both permissions were blocked",
  deniedTitleLocation: "Location was blocked",
  deniedTitleMic: "The microphone was blocked",
  deniedStillReport: "You can still report.",
  deniedTypeInstead: "Type your report instead of speaking it.",
  deniedPinInstead: "Place your location on the map by hand.",
  deniedTurnOnLater: "You can turn these on later from the padlock beside the web address.",

  tabReport: "Report",
  tabMine: "My reports",
  headerAction: "Report an emergency",

  whatHappened: "What is happening? Write in Urdu, Roman Urdu or English.",
  composePlaceholder: "For example: water has come into our house...",
  recordVoice: "Record a voice note",
  attachVoice: "Voice",
  attachPhoto: "Photo",
  attachLocation: "Location",
  stopRecording: "Stop",
  recordingTapToStop: "Recording, tap to stop",
  voiceAttached: "Voice note attached",
  silentMicTitle: "We heard nothing",
  silentMicBody:
    "Nothing at all was recorded, so your microphone is muted or the wrong one is selected. Check it and record again, or type your report instead. We will not send an empty recording.",
  addPhoto: "Add a photo",
  photoAttached: "Photo attached",
  shareLocation: "Share your location",
  locationAttached: "Location attached",
  locationAttachedTo: (m) => `Location attached, accurate to about ${m}m`,
  findingYou: "Finding you...",
  locationUnavailable: "Location unavailable, tap to try again",
  sendReport: "Send report",

  understanding: "Reading your report...",
  understandingHint: "This takes a few seconds.",
  fieldFace: "",
  fromControlRoom: "From the control room",
  replyWithUpdate:
    "To reply, add an update to your report below: voice, a photo, or type it.",
  savedOffline: "No internet. Your report has been saved.",
  savedOfflineHint: "It will send itself as soon as you have signal. It stays saved even if you close the app.",
  pendingCount: (n) => `${n} report${n === 1 ? "" : "s"} waiting to send`,
  sendingPending: "Sending your waiting reports...",
  pendingSent: (n) => `${n} waiting report${n === 1 ? "" : "s"} sent`,
  errorPhoto: "That photo could not be read. Remove it and send again, or take a new one with the camera. The rest of your report is safe.",
  errorService: "The service is not responding right now. Your report is saved. Please try again.",
  errorNetwork: "No internet connection. Check it and send again.",
  errorGeneric: "Something went wrong sending your report. Please try again.",
  photoUnreadable: "The photo could not be read, so it was left out. The rest of your report was sent.",
  photoConverted: "Photo ready",

  weUnderstood: "This is what we understood",
  correctIt: "Correct anything that is wrong, right here.",
  listen: "Listen",
  playing: "Playing",
  situation: "Situation",
  peopleAffected: "People affected",
  vulnerablePresent: "Vulnerable people present",
  whatWeHeard: "What we heard",
  edit: "Edit",
  doneEditing: "Done",
  addDetail: "Add",
  removeItem: "Remove",
  oneMoreThing: "One more thing",
  helpsTeam: "This helps the rescue team reach you.",
  confirmAndSend: "Confirm and send",

  received: "Your report has been received",
  receivedBody: "It has been passed to the relief team.",
  viewMyReport: "View my report",
  sendAnother: "Send another report",

  confirmPlace: "Confirm the place",
  dragPin: "Drag the pin to your exact spot. A phone's location is often off by half a street.",
  tapMap: "Tap the map to place your exact location.",
  pinPlaced: "Pin placed by you",
  fromPhone: (m) => (m === null ? "From your phone" : `From your phone, accurate to about ${m}m`),
  noLocationYet: "No location set yet",
  useMyLocation: "Use my location",
  locating: "Locating...",
  findYourArea: "Find your city or district",
  areaPlaceholder: "e.g. Toba Tek Singh",
  noAreaMatch: "No city found",
  placeIntro: "This is how a team finds you.",
  addressLabel: "Write your address",
  addressHint: "Area, street, and a nearby landmark such as a mosque or school",
  addressSaved: "Address written",
  addressOnly: "Address given, no map pin",
  findOnMap: "Find on map",
  searchingMap: "Searching...",
  geocodeNone: "That address was not found on the map. Your written address still reaches the team.",
  geocodePick: "Is one of these right? Tap to place the pin.",
  geocodeWarn: "Automatic search can be wrong. Check the map before accepting.",
  orPlaceOnMap: "Or place the pin on the map yourself",
  pinFromAddress: "Pin placed from your address",

  myReportsEmpty: "You have not sent any reports yet",
  myReportsEmptyBody:
    "Anything you send will appear here, along with what the control room has done about it.",
  myReportsFailed: "Could not load your reports",
  myReportsFailedBody: "Check your connection and try again.",
  tryAgain: "Try again",
  team: "Team",
  cancel: "Cancel",
  addUpdate: "Add an update",
  addUpdateHint: "What you already sent stays as it is. This is added alongside it.",
  updatePlaceholder: "e.g. the water is higher now, we have moved to the roof",
  sendUpdate: "Send",
  sendingUpdate: "Sending...",
  updateSent: "Your update has reached the team",
  updateTooEarly: "Your first report is still being reviewed. Please try again shortly.",
  updateFailed: "That could not be sent. Please try again.",
  markSafeTitle: "Are you safe now?",
  markSafeBody:
    "If help has reached you or the danger has passed, say so. The control room will know a team can go elsewhere.",
  markSafe: "I am safe now",
  markingSafe: "Sending...",
  safeConfirmed: "You reported that you are safe",
  undoSafe: "That was a mistake, undo it",
  stateNotReviewed: "Received. Not yet reviewed by the control room.",
  stateNew: "Received. Waiting for the control room to review it.",
  stateVerified: "Verified by the control room.",
  stateAssigned: "A team has been assigned to you.",
  stateResponding: "A team is on its way.",
  stateResolved: "Marked resolved.",
  stateSafe: "You reported that you are safe.",
  justNow: "just now",
  minutesAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
  attachedVoice: "voice note",
  attachedPhoto: "photo",
  attachedLocation: "location attached",
  attachedNoLocation: "no location",
};

export const STRINGS: Record<Lang, Strings> = { ur, en };

export function stringsFor(lang: Lang): Strings {
  return STRINGS[lang] ?? STRINGS.ur;
}

/**
 * Urgency and vulnerability labels. These come back from the model as machine
 * tokens, so both languages are rendered from the same key rather than from
 * whatever the model happened to write.
 */
export const URGENCY: Record<string, Record<Lang, string>> = {
  trapped_people: { ur: "لوگ پھنسے ہوئے ہیں", en: "People trapped" },
  medical_need: { ur: "طبی مدد درکار", en: "Medical help needed" },
  rising_water: { ur: "پانی بڑھ رہا ہے", en: "Water rising" },
  blocked_access: { ur: "راستہ بند", en: "Access blocked" },
  no_safe_route: { ur: "محفوظ راستہ نہیں", en: "No safe route" },
  structural_damage: { ur: "عمارت کو نقصان", en: "Structural damage" },
};

export const VULNERABLE: Record<string, Record<Lang, string>> = {
  children: { ur: "بچے", en: "Children" },
  elderly: { ur: "بزرگ", en: "Elderly" },
  pregnant: { ur: "حاملہ خاتون", en: "Pregnant woman" },
  disabled: { ur: "معذور افراد", en: "Disabled people" },
  injured: { ur: "زخمی", en: "Injured" },
  sick: { ur: "بیمار", en: "Sick" },
};


export const ROAD: Record<string, Record<Lang, string>> = {
  open: { ur: "راستہ کھلا ہے", en: "Road is open" },
  partial: { ur: "راستہ جزوی کھلا ہے", en: "Partly passable" },
  blocked: { ur: "راستہ بند ہے", en: "Road is blocked" },
  unknown: { ur: "معلوم نہیں", en: "Not known" },
};

export const FIELD_LABEL: Record<string, Record<Lang, string>> = {
  road_access: { ur: "راستے کی حالت", en: "Road access" },
};

export function labelFor(
  table: Record<string, Record<Lang, string>>,
  key: string,
  lang: Lang,
): string {
  return table[key]?.[lang] ?? key.replace(/_/g, " ");
}
