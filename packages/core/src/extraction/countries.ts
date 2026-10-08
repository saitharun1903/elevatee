/**
 * Country name → ISO-3166 alpha-2 lookup. Keys are normalized (lowercase, ASCII-folded,
 * punctuation stripped). Only used to normalize values the source actually provided.
 */

const NAMES: Record<string, string> = {
  afghanistan: "AF", albania: "AL", algeria: "DZ", andorra: "AD", angola: "AO",
  "antigua and barbuda": "AG", argentina: "AR", armenia: "AM", australia: "AU", austria: "AT",
  azerbaijan: "AZ", bahamas: "BS", "the bahamas": "BS", bahrain: "BH", bangladesh: "BD",
  barbados: "BB", belarus: "BY", belgium: "BE", belize: "BZ", benin: "BJ", bhutan: "BT",
  bolivia: "BO", "bosnia and herzegovina": "BA", bosnia: "BA", botswana: "BW", brazil: "BR",
  brasil: "BR", brunei: "BN", "brunei darussalam": "BN", bulgaria: "BG", "burkina faso": "BF",
  burundi: "BI", cambodia: "KH", cameroon: "CM", canada: "CA", "cape verde": "CV", "cabo verde": "CV",
  "central african republic": "CF", chad: "TD", chile: "CL", china: "CN", "peoples republic of china": "CN",
  prc: "CN", colombia: "CO", comoros: "KM", congo: "CG", "republic of the congo": "CG",
  "democratic republic of the congo": "CD", drc: "CD", "costa rica": "CR", "cote divoire": "CI",
  "ivory coast": "CI", croatia: "HR", cuba: "CU", cyprus: "CY", czechia: "CZ", "czech republic": "CZ",
  denmark: "DK", djibouti: "DJ", dominica: "DM", "dominican republic": "DO", ecuador: "EC",
  egypt: "EG", "el salvador": "SV", "equatorial guinea": "GQ", eritrea: "ER", estonia: "EE",
  eswatini: "SZ", swaziland: "SZ", ethiopia: "ET", fiji: "FJ", finland: "FI", france: "FR",
  gabon: "GA", gambia: "GM", "the gambia": "GM", georgia: "GE", germany: "DE", deutschland: "DE",
  ghana: "GH", greece: "GR", grenada: "GD", guatemala: "GT", guinea: "GN", "guinea bissau": "GW",
  guyana: "GY", haiti: "HT", honduras: "HN", "hong kong": "HK", "hong kong sar": "HK", hungary: "HU",
  iceland: "IS", india: "IN", bharat: "IN", indonesia: "ID", iran: "IR", iraq: "IQ", ireland: "IE",
  "republic of ireland": "IE", israel: "IL", italy: "IT", italia: "IT", jamaica: "JM", japan: "JP",
  jordan: "JO", kazakhstan: "KZ", kenya: "KE", kiribati: "KI", kosovo: "XK", kuwait: "KW",
  kyrgyzstan: "KG", laos: "LA", latvia: "LV", lebanon: "LB", lesotho: "LS", liberia: "LR",
  libya: "LY", liechtenstein: "LI", lithuania: "LT", luxembourg: "LU", macau: "MO", macao: "MO",
  madagascar: "MG", malawi: "MW", malaysia: "MY", maldives: "MV", mali: "ML", malta: "MT",
  "marshall islands": "MH", mauritania: "MR", mauritius: "MU", mexico: "MX", "mexique": "MX",
  micronesia: "FM", moldova: "MD", monaco: "MC", mongolia: "MN", montenegro: "ME", morocco: "MA",
  mozambique: "MZ", myanmar: "MM", burma: "MM", namibia: "NA", nauru: "NR", nepal: "NP",
  netherlands: "NL", "the netherlands": "NL", holland: "NL", nederland: "NL", "new zealand": "NZ",
  nicaragua: "NI", niger: "NE", nigeria: "NG", "north korea": "KP", "north macedonia": "MK",
  macedonia: "MK", norway: "NO", oman: "OM", pakistan: "PK", palau: "PW", palestine: "PS",
  panama: "PA", "papua new guinea": "PG", paraguay: "PY", peru: "PE", philippines: "PH",
  "the philippines": "PH", poland: "PL", polska: "PL", portugal: "PT", "puerto rico": "PR",
  qatar: "QA", romania: "RO", russia: "RU", "russian federation": "RU", rwanda: "RW",
  "saint kitts and nevis": "KN", "saint lucia": "LC", "saint vincent and the grenadines": "VC",
  samoa: "WS", "san marino": "SM", "sao tome and principe": "ST", "saudi arabia": "SA", ksa: "SA",
  "kingdom of saudi arabia": "SA", senegal: "SN", serbia: "RS", seychelles: "SC",
  "sierra leone": "SL", singapore: "SG", slovakia: "SK", slovenia: "SI", "solomon islands": "SB",
  somalia: "SO", "south africa": "ZA", "south korea": "KR", korea: "KR", "republic of korea": "KR",
  "korea republic of": "KR", "south sudan": "SS", spain: "ES", espana: "ES", "sri lanka": "LK",
  sudan: "SD", suriname: "SR", sweden: "SE", sverige: "SE", switzerland: "CH", schweiz: "CH",
  suisse: "CH", syria: "SY", taiwan: "TW", tajikistan: "TJ", tanzania: "TZ", thailand: "TH",
  "timor leste": "TL", "east timor": "TL", togo: "TG", tonga: "TO", "trinidad and tobago": "TT",
  tunisia: "TN", turkey: "TR", turkiye: "TR", turkmenistan: "TM", tuvalu: "TV", uganda: "UG",
  ukraine: "UA", "united arab emirates": "AE", uae: "AE", emirates: "AE", "united kingdom": "GB",
  uk: "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB",
  "northern ireland": "GB", "united states": "US", "united states of america": "US", usa: "US",
  us: "US", america: "US", uruguay: "UY", uzbekistan: "UZ", vanuatu: "VU", "vatican city": "VA",
  venezuela: "VE", vietnam: "VN", "viet nam": "VN", yemen: "YE", zambia: "ZM", zimbabwe: "ZW",
};

const ALPHA3: Record<string, string> = {
  USA: "US", GBR: "GB", IND: "IN", CAN: "CA", DEU: "DE", FRA: "FR", NLD: "NL", IRL: "IE",
  ESP: "ES", ITA: "IT", POL: "PL", SWE: "SE", CHE: "CH", AUS: "AU", NZL: "NZ", SGP: "SG",
  ARE: "AE", SAU: "SA", QAT: "QA", JPN: "JP", CHN: "CN", KOR: "KR", BRA: "BR", MEX: "MX",
  ARG: "AR", COL: "CO", CHL: "CL", ZAF: "ZA", NGA: "NG", KEN: "KE", EGY: "EG", ISR: "IL",
  PHL: "PH", IDN: "ID", MYS: "MY", VNM: "VN", PAK: "PK", BGD: "BD", LKA: "LK", PRT: "PT",
  BEL: "BE", AUT: "AT", DNK: "DK", NOR: "NO", FIN: "FI", CZE: "CZ", ROU: "RO", HUN: "HU",
  GRC: "GR", TUR: "TR", UKR: "UA", THA: "TH", HKG: "HK", TWN: "TW", PER: "PE", NPL: "NP",
  KWT: "KW", OMN: "OM", BHR: "BH", JOR: "JO", MAR: "MA", GHA: "GH", LUX: "LU", EST: "EE",
};

/** Two-letter codes that are valid ISO alpha-2 (subset check: letters only). "UK" is mapped to GB. */
const ALPHA2_ALIASES: Record<string, string> = { UK: "GB", EL: "GR" };

/** All alpha-2 codes that appear in the name table, plus a few extra territories. */
const KNOWN_ALPHA2 = new Set<string>([...Object.values(NAMES), ...Object.values(ALPHA3), "GI", "JE", "GG", "IM", "RE", "GU", "VI", "AW", "CW", "BM", "KY"]);

export function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Convert a country name or code to ISO alpha-2, or null when unknown.
 * Accepts alpha-2 ("IN", "uk"), alpha-3 ("USA") and names ("India", "United Kingdom").
 */
export function toCountryCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    const aliased = ALPHA2_ALIASES[upper] ?? upper;
    return KNOWN_ALPHA2.has(aliased) ? aliased : null;
  }
  if (/^[A-Z]{3}$/.test(upper) && ALPHA3[upper]) return ALPHA3[upper] ?? null;
  return NAMES[normalizeKey(v)] ?? null;
}

/** Names that are also common sub-national places; not trusted when parsing free-form locations. */
const AMBIGUOUS_IN_LOCATIONS = new Set(["georgia", "us", "america", "jersey", "guinea"]);

/**
 * Find a country named explicitly as the last comma-separated part of a location string
 * ("Pune, Maharashtra, India" → IN). Returns null when the last part is not a known country.
 */
export function countryFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const first = location.split(/[;|·]/)[0] ?? "";
  const parts = first.split(",").map((p) => p.replace(/\(.*?\)/g, "").trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || parts.length < 1) return null;
  const key = normalizeKey(last);
  if (AMBIGUOUS_IN_LOCATIONS.has(key)) return null;
  if (/^[A-Za-z]{2}$/.test(last)) {
    // Two-letter tails are usually state/province codes ("Austin, TX", "Toronto, ON"); only accept UK.
    return last.toUpperCase() === "UK" ? "GB" : null;
  }
  return NAMES[key] ?? null;
}
