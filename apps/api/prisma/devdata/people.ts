/**
 * Fake identities. Everything here is synthetic:
 * - names are combinations of common Norwegian first and last names,
 * - emails use the reserved example.org/.com/.net domains,
 * - national ids are synthetic "Tenor" numbers (month + 80), which are valid for
 *   @navikt/fnrvalidator but can never belong to a real person,
 * - organisation numbers pass the mod 11 check but are random.
 */
import { Rng } from "./random";

const FIRST_NAMES = [
  "Ola",
  "Kari",
  "Nora",
  "Emma",
  "Jakob",
  "Emil",
  "Sofie",
  "Ingrid",
  "Lars",
  "Anne",
  "Henrik",
  "Maja",
  "Sander",
  "Thea",
  "Magnus",
  "Ida",
  "Kristian",
  "Ingvild",
  "Jonas",
  "Hanne",
  "Martin",
  "Silje",
  "Eirik",
  "Marte",
  "Andreas",
  "Live",
  "Tobias",
  "Sara",
  "Mathias",
  "Julie",
  "Håkon",
  "Astrid",
  "Sindre",
  "Tiril",
  "Øystein",
  "Ragnhild",
  "Torbjørn",
  "Solveig",
  "Vegard",
  "Synnøve",
  "Erlend",
  "Hedda",
  "Aksel",
  "Frida",
  "Even",
  "Mari",
  "Simen",
  "Guro",
  "Bjørn",
  "Eli",
  "Petter",
  "Linnea",
  "Sigurd",
  "Vilde",
  "Trond",
  "Åse",
  "Marius",
  "Helene",
  "Knut",
  "Tuva",
];

const LAST_NAMES = [
  "Hansen",
  "Johansen",
  "Olsen",
  "Larsen",
  "Andersen",
  "Pedersen",
  "Nilsen",
  "Kristiansen",
  "Jensen",
  "Karlsen",
  "Johnsen",
  "Pettersen",
  "Eriksen",
  "Berg",
  "Haugen",
  "Hagen",
  "Johannessen",
  "Andreassen",
  "Jacobsen",
  "Dahl",
  "Jørgensen",
  "Halvorsen",
  "Henriksen",
  "Lund",
  "Sørensen",
  "Jakobsen",
  "Moen",
  "Gundersen",
  "Iversen",
  "Strand",
  "Solberg",
  "Svendsen",
  "Eide",
  "Knutsen",
  "Martinsen",
  "Paulsen",
  "Bakken",
  "Kristoffersen",
  "Mathisen",
  "Lie",
  "Amundsen",
  "Nguyen",
  "Rasmussen",
  "Ali",
  "Lunde",
  "Solheim",
  "Berge",
  "Moe",
  "Nygård",
  "Bakke",
  "Kristensen",
  "Fredriksen",
  "Holm",
  "Lien",
  "Hauge",
  "Christensen",
  "Andresen",
  "Nielsen",
  "Knudsen",
  "Evensen",
];

const COMPANY_WORDS = [
  "Fjord",
  "Nordlys",
  "Vidde",
  "Bølge",
  "Furu",
  "Granitt",
  "Kyst",
  "Lykt",
  "Tind",
  "Elv",
];
const COMPANY_SUFFIXES = ["Holding AS", "Invest AS", "Eiendom AS", "Consulting AS", "Teknologi AS"];

const EMAIL_DOMAINS = ["example.org", "example.com", "example.net"];

function ascii(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

export type FakePerson = { fullName: string; email: string; isCompany: boolean };

/** `n` makes the email unique (Donors.email is unique) */
export function fakePerson(rng: Rng, n: number, isCompany = false): FakePerson {
  const domain = rng.pick(EMAIL_DOMAINS);
  if (isCompany) {
    const name = `${rng.pick(COMPANY_WORDS)}${rng.pick(LAST_NAMES).toLowerCase()} ${rng.pick(
      COMPANY_SUFFIXES,
    )}`;
    return { fullName: name, email: `post.${n}@${ascii(name)}.${domain}`, isCompany };
  }
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  const style = rng.int(0, 2);
  const local =
    style === 0
      ? `${ascii(first)}.${ascii(last)}`
      : style === 1
      ? `${ascii(first)}${ascii(last)}`
      : `${ascii(first)}`;
  return { fullName: `${first} ${last}`, email: `${local}.${n}@${domain}`, isCompany };
}

/** Synthetic (Tenor) fødselsnummer: DD (MM+80) YY III K1 K2 */
export function fakeFnr(rng: Rng): string {
  for (;;) {
    const year = rng.int(1945, 2004);
    const month = rng.int(1, 12);
    const day = rng.int(1, 28);
    const individual = year >= 2000 ? rng.int(500, 999) : rng.int(0, 499);
    const base =
      String(day).padStart(2, "0") +
      String(month + 80) +
      String(year % 100).padStart(2, "0") +
      String(individual).padStart(3, "0");
    const d = base.split("").map(Number);
    let k1 =
      11 -
      ((3 * d[0] +
        7 * d[1] +
        6 * d[2] +
        1 * d[3] +
        8 * d[4] +
        9 * d[5] +
        4 * d[6] +
        5 * d[7] +
        2 * d[8]) %
        11);
    if (k1 === 11) k1 = 0;
    if (k1 === 10) continue;
    let k2 =
      11 -
      ((5 * d[0] +
        4 * d[1] +
        3 * d[2] +
        2 * d[3] +
        7 * d[4] +
        6 * d[5] +
        5 * d[6] +
        4 * d[7] +
        3 * d[8] +
        2 * k1) %
        11);
    if (k2 === 11) k2 = 0;
    if (k2 === 10) continue;
    return `${base}${k1}${k2}`;
  }
}

/** Nine digit organisation number with a valid mod 11 check digit */
export function fakeOrgNumber(rng: Rng): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const digits = [9, ...Array.from({ length: 7 }, () => rng.int(0, 9))];
    const rest = digits.reduce((sum, digit, i) => sum + digit * weights[i], 0) % 11;
    const check = rest === 0 ? 0 : 11 - rest;
    if (check === 10) continue;
    return digits.join("") + check;
  }
}

function luhnCheckDigit(partial: string): number {
  // Same as KID.luhn_caclulate in src/custom_modules/KID.ts
  const code = partial + "0";
  const parity = code.length % 2;
  let sum = 0;
  for (let i = code.length - 1; i >= 0; i--) {
    let digit = Number(code[i]);
    if (i % 2 === parity) digit *= 2;
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  const checksum = sum % 10;
  return checksum === 0 ? 0 : 10 - checksum;
}

/** 15 digit KID in the current format: donor id (6) + random (8) + Luhn check digit */
export function makeKid(rng: Rng, donorId: number): string {
  const partial =
    String(donorId).padStart(6, "0") + Array.from({ length: 8 }, () => rng.int(1, 9)).join("");
  return partial + luhnCheckDigit(partial);
}

/** Random 15 digit KID that is not in the database (for review queue items) */
export function unknownKid(rng: Rng): string {
  const partial = "9" + Array.from({ length: 13 }, () => rng.int(0, 9)).join("");
  return partial + luhnCheckDigit(partial);
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * Vipps-style ids: agr_xxxxxxx / chr-xxxxxxx (11 characters). Three random characters plus
 * `n` in base 36, so ids are unique by construction (chargeID is unique across agreements, and
 * the column collation is case-insensitive, hence no lower case in the counter part).
 */
export function vippsId(rng: Rng, prefix: "agr_" | "chr-", n: number): string {
  let encoded = "";
  for (let i = 0; i < 4; i++) {
    encoded = BASE36[n % 36] + encoded;
    n = Math.floor(n / 36);
  }
  return prefix + Array.from({ length: 3 }, () => rng.pick(ID_CHARS.split(""))).join("") + encoded;
}

export function randomToken(rng: Rng, length: number): string {
  return Array.from({ length }, () => ID_CHARS[rng.int(0, ID_CHARS.length - 1)]).join("");
}
