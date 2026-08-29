/**
 * Which HQ owns an incident.
 *
 * Relief in Pakistan is run district by district: a control room in Karachi cannot
 * task a boat in Nowshera, and a national list of every incident in the country is
 * worse than useless to the person staffing one room. Incidents are therefore
 * assigned to a district at creation and each operator works one district's board.
 *
 * Assignment is by nearest centroid, computed locally. A reverse-geocoding service
 * would give exact boundaries, but it adds a network dependency to the one code
 * path that must work during the disaster that took the network out. Centroids are
 * approximate near a district border and exact enough everywhere else, which is the
 * right trade for something a human then confirms.
 *
 * Coordinates are district or city centres, rounded to four decimals.
 */

export type District = {
  id: string;
  name: string;
  /** Urdu name, so an operator sees their own city written properly. */
  nameUrdu: string;
  province: string;
  lat: number;
  lon: number;
};

export const DISTRICTS: District[] = [
  // Sindh
  { id: "karachi", name: "Karachi", nameUrdu: "کراچی", province: "Sindh", lat: 24.8607, lon: 67.0011 },
  { id: "hyderabad", name: "Hyderabad", nameUrdu: "حیدرآباد", province: "Sindh", lat: 25.396, lon: 68.3578 },
  { id: "sukkur", name: "Sukkur", nameUrdu: "سکھر", province: "Sindh", lat: 27.7052, lon: 68.8574 },
  { id: "larkana", name: "Larkana", nameUrdu: "لاڑکانہ", province: "Sindh", lat: 27.5598, lon: 68.2264 },
  { id: "thatta", name: "Thatta", nameUrdu: "ٹھٹھہ", province: "Sindh", lat: 24.7461, lon: 67.9236 },
  { id: "badin", name: "Badin", nameUrdu: "بدین", province: "Sindh", lat: 24.6558, lon: 68.837 },
  { id: "dadu", name: "Dadu", nameUrdu: "دادو", province: "Sindh", lat: 26.7319, lon: 67.7761 },
  { id: "jacobabad", name: "Jacobabad", nameUrdu: "جیکب آباد", province: "Sindh", lat: 28.2769, lon: 68.4514 },
  { id: "shikarpur", name: "Shikarpur", nameUrdu: "شکارپور", province: "Sindh", lat: 27.9556, lon: 68.6382 },
  { id: "khairpur", name: "Khairpur", nameUrdu: "خیرپور", province: "Sindh", lat: 27.5295, lon: 68.7592 },
  { id: "mirpurkhas", name: "Mirpur Khas", nameUrdu: "میرپور خاص", province: "Sindh", lat: 25.5276, lon: 69.0122 },
  { id: "nawabshah", name: "Shaheed Benazirabad", nameUrdu: "شہید بینظیر آباد", province: "Sindh", lat: 26.2442, lon: 68.4099 },
  { id: "kashmore", name: "Kashmore", nameUrdu: "کشمور", province: "Sindh", lat: 28.4372, lon: 69.5847 },
  { id: "sanghar", name: "Sanghar", nameUrdu: "سانگھڑ", province: "Sindh", lat: 26.0468, lon: 68.9481 },

  // Punjab
  { id: "lahore", name: "Lahore", nameUrdu: "لاہور", province: "Punjab", lat: 31.5204, lon: 74.3587 },
  { id: "faisalabad", name: "Faisalabad", nameUrdu: "فیصل آباد", province: "Punjab", lat: 31.4187, lon: 73.0791 },
  { id: "rawalpindi", name: "Rawalpindi", nameUrdu: "راولپنڈی", province: "Punjab", lat: 33.5651, lon: 73.0169 },
  { id: "multan", name: "Multan", nameUrdu: "ملتان", province: "Punjab", lat: 30.1575, lon: 71.5249 },
  { id: "gujranwala", name: "Gujranwala", nameUrdu: "گوجرانوالہ", province: "Punjab", lat: 32.1877, lon: 74.1945 },
  { id: "sialkot", name: "Sialkot", nameUrdu: "سیالکوٹ", province: "Punjab", lat: 32.4945, lon: 74.5229 },
  { id: "bahawalpur", name: "Bahawalpur", nameUrdu: "بہاولپور", province: "Punjab", lat: 29.3956, lon: 71.6836 },
  { id: "sargodha", name: "Sargodha", nameUrdu: "سرگودھا", province: "Punjab", lat: 32.0836, lon: 72.6711 },
  { id: "dgkhan", name: "Dera Ghazi Khan", nameUrdu: "ڈیرہ غازی خان", province: "Punjab", lat: 30.0489, lon: 70.6403 },
  { id: "muzaffargarh", name: "Muzaffargarh", nameUrdu: "مظفر گڑھ", province: "Punjab", lat: 30.0736, lon: 71.1805 },
  { id: "rajanpur", name: "Rajanpur", nameUrdu: "راجن پور", province: "Punjab", lat: 29.1044, lon: 70.3301 },
  { id: "layyah", name: "Layyah", nameUrdu: "لیہ", province: "Punjab", lat: 30.9693, lon: 70.9428 },
  { id: "rykhan", name: "Rahim Yar Khan", nameUrdu: "رحیم یار خان", province: "Punjab", lat: 28.4202, lon: 70.2952 },
  { id: "sahiwal", name: "Sahiwal", nameUrdu: "ساہیوال", province: "Punjab", lat: 30.6682, lon: 73.1114 },
  { id: "okara", name: "Okara", nameUrdu: "اوکاڑہ", province: "Punjab", lat: 30.8138, lon: 73.4534 },
  { id: "tobateksingh", name: "Toba Tek Singh", nameUrdu: "ٹوبہ ٹیک سنگھ", province: "Punjab", lat: 30.9709, lon: 72.4826 },
  { id: "jhang", name: "Jhang", nameUrdu: "جھنگ", province: "Punjab", lat: 31.2781, lon: 72.3317 },
  { id: "khanewal", name: "Khanewal", nameUrdu: "خانیوال", province: "Punjab", lat: 30.3017, lon: 71.9321 },
  { id: "vehari", name: "Vehari", nameUrdu: "وہاڑی", province: "Punjab", lat: 30.0331, lon: 72.3489 },
  { id: "gujrat", name: "Gujrat", nameUrdu: "گجرات", province: "Punjab", lat: 32.5731, lon: 74.0789 },
  { id: "sheikhupura", name: "Sheikhupura", nameUrdu: "شیخوپورہ", province: "Punjab", lat: 31.7131, lon: 73.9783 },
  { id: "bahawalnagar", name: "Bahawalnagar", nameUrdu: "بہاولنگر", province: "Punjab", lat: 29.9989, lon: 73.2536 },
  { id: "mianwali", name: "Mianwali", nameUrdu: "میانوالی", province: "Punjab", lat: 32.5839, lon: 71.5426 },

  // Islamabad
  { id: "islamabad", name: "Islamabad", nameUrdu: "اسلام آباد", province: "Islamabad", lat: 33.6844, lon: 73.0479 },

  // Khyber Pakhtunkhwa
  { id: "peshawar", name: "Peshawar", nameUrdu: "پشاور", province: "Khyber Pakhtunkhwa", lat: 34.0151, lon: 71.5249 },
  { id: "nowshera", name: "Nowshera", nameUrdu: "نوشہرہ", province: "Khyber Pakhtunkhwa", lat: 34.0153, lon: 71.9747 },
  { id: "charsadda", name: "Charsadda", nameUrdu: "چارسدہ", province: "Khyber Pakhtunkhwa", lat: 34.1453, lon: 71.7308 },
  { id: "swat", name: "Swat", nameUrdu: "سوات", province: "Khyber Pakhtunkhwa", lat: 34.7717, lon: 72.3609 },
  { id: "mardan", name: "Mardan", nameUrdu: "مردان", province: "Khyber Pakhtunkhwa", lat: 34.198, lon: 72.0447 },
  { id: "dikhan", name: "Dera Ismail Khan", nameUrdu: "ڈیرہ اسماعیل خان", province: "Khyber Pakhtunkhwa", lat: 31.8313, lon: 70.9016 },
  { id: "abbottabad", name: "Abbottabad", nameUrdu: "ایبٹ آباد", province: "Khyber Pakhtunkhwa", lat: 34.1688, lon: 73.2215 },
  { id: "chitral", name: "Chitral", nameUrdu: "چترال", province: "Khyber Pakhtunkhwa", lat: 35.8518, lon: 71.7864 },
  { id: "kohat", name: "Kohat", nameUrdu: "کوہاٹ", province: "Khyber Pakhtunkhwa", lat: 33.5869, lon: 71.4414 },

  // Balochistan
  { id: "quetta", name: "Quetta", nameUrdu: "کوئٹہ", province: "Balochistan", lat: 30.1798, lon: 66.975 },
  { id: "gwadar", name: "Gwadar", nameUrdu: "گوادر", province: "Balochistan", lat: 25.1264, lon: 62.3225 },
  { id: "khuzdar", name: "Khuzdar", nameUrdu: "خضدار", province: "Balochistan", lat: 27.812, lon: 66.6106 },
  { id: "sibi", name: "Sibi", nameUrdu: "سبی", province: "Balochistan", lat: 29.543, lon: 67.8773 },
  { id: "lasbela", name: "Lasbela", nameUrdu: "لسبیلہ", province: "Balochistan", lat: 25.8676, lon: 66.6222 },
  { id: "naseerabad", name: "Naseerabad", nameUrdu: "نصیر آباد", province: "Balochistan", lat: 28.5, lon: 68.0 },

  // Azad Jammu and Kashmir, Gilgit-Baltistan
  { id: "muzaffarabad", name: "Muzaffarabad", nameUrdu: "مظفرآباد", province: "AJK", lat: 34.3699, lon: 73.4711 },
  { id: "mirpur", name: "Mirpur", nameUrdu: "میرپور", province: "AJK", lat: 33.1471, lon: 73.7518 },
  { id: "gilgit", name: "Gilgit", nameUrdu: "گلگت", province: "Gilgit-Baltistan", lat: 35.9208, lon: 74.3144 },
  { id: "skardu", name: "Skardu", nameUrdu: "سکردو", province: "Gilgit-Baltistan", lat: 35.2971, lon: 75.6333 },
];

export const DISTRICTS_BY_ID: Record<string, District> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
);

/** Great-circle distance in kilometres. */
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The district whose centre is nearest, or null when nothing is close enough.
 *
 * The 150km ceiling exists so a report from outside the covered set is left
 * unassigned rather than dragged onto whichever distant HQ happened to be least
 * far away. An unassigned incident is visible to every operator, which is the safe
 * failure: better that several rooms see it than that none do.
 */
export function districtFor(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const d of DISTRICTS) {
    const km = haversineKm(lat, lon, d.lat, d.lon);
    if (km < bestKm) {
      bestKm = km;
      best = d.id;
    }
  }
  return bestKm <= 150 ? best : null;
}

export function districtName(id: string | null, urdu = false): string {
  if (!id) return urdu ? "نامعلوم علاقہ" : "Unassigned area";
  const d = DISTRICTS_BY_ID[id];
  if (!d) return id;
  return urdu ? d.nameUrdu : d.name;
}
