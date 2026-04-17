export type Contact = {
  name: string;
  phone: string;
  email: string;
  address1?: string;
  postNumber?: string;
  postCity?: string;
  sakomrade?: string;
};

export type Config = {
  reportingYear: number;
  programName: string;
  orgNr: string;
  orgName: string;
  created?: string;
  schemaLocation?: string;
  avsandareContact: Contact;
  uppgiftslamnareContact: Contact;
};

export type CsvRow = { person: string; amount: number; line: number };

export type Ku65Entry = {
  person: string;
  amount: number;
  specNumber: number;
};

const DEFAULT_SCHEMA_LOCATION =
  "http://xmls.skatteverket.se/se/skatteverket/ai/instans/infoForBeskattning/11.0 " +
  "http://xmls.skatteverket.se/se/skatteverket/ai/kontrolluppgift/instans/Kontrolluppgifter_11.0.xsd";

const NS_INSTANS = "http://xmls.skatteverket.se/se/skatteverket/ai/instans/infoForBeskattning/11.0";
const NS_GM = "http://xmls.skatteverket.se/se/skatteverket/ai/gemensamt/infoForBeskattning/11.0";
const NS_KU = "http://xmls.skatteverket.se/se/skatteverket/ai/komponent/infoForBeskattning/11.0";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatLocalDateTime(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    "T",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
    ":",
    pad2(date.getSeconds()),
  ].join("");
}

export function normalizePersonnummer(value: string, reportingYear: number): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12) return digits;
  if (digits.length !== 10) {
    throw new Error(`Invalid personnummer length: ${value}`);
  }
  const yy = Number(digits.slice(0, 2));
  const baseCentury = Math.floor(reportingYear / 100) * 100;
  const cutoff = reportingYear % 100;
  const century = yy <= cutoff ? baseCentury : baseCentury - 100;
  return `${century + yy}${digits.slice(2)}`;
}

export function isValidPersonnummer(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length === 12 ? digits.slice(2) : digits;
  if (ten.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const n = Number(ten[i]);
    if (!Number.isFinite(n)) return false;
    const product = n * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(product / 10) + (product % 10);
  }
  const checkDigit = Number(ten[9]);
  if (!Number.isFinite(checkDigit)) return false;
  const expected = (10 - (sum % 10)) % 10;
  return expected === checkDigit;
}

export function normalizeOrgNr(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12) return digits;
  if (digits.length === 10) {
    return `16${digits}`;
  }
  throw new Error(`Invalid orgNr length: ${value}`);
}

export function parseCsvFromString(raw: string): CsvRow[] {
  const lines = raw.split(/\r?\n/);
  const rows: CsvRow[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 2) {
      throw new Error(`Invalid CSV line ${i + 1}: ${line}`);
    }
    const person = parts[0].trim();
    const amountRaw = parts[1].trim();
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid amount on line ${i + 1}: ${amountRaw}`);
    }
    rows.push({ person, amount, line: i + 1 });
  }
  return rows;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildKu65Xml(config: Config, reportingYear: number, entries: Ku65Entry[]): string {
  const created = config.created ?? formatLocalDateTime(new Date());
  const schemaLocation = config.schemaLocation ?? DEFAULT_SCHEMA_LOCATION;
  const orgNr = normalizeOrgNr(config.orgNr);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push(
    `<Skatteverket xmlns="${NS_INSTANS}" xmlns:gm="${NS_GM}" xmlns:ku="${NS_KU}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" omrade="Kontrolluppgifter" xsi:schemaLocation="${schemaLocation}">`,
  );
  lines.push("  <ku:Avsandare>");
  lines.push(`    <ku:Programnamn>${escapeXml(config.programName)}</ku:Programnamn>`);
  lines.push(`    <ku:Organisationsnummer>${escapeXml(orgNr)}</ku:Organisationsnummer>`);
  lines.push("    <ku:TekniskKontaktperson>");
  lines.push(`      <ku:Namn>${escapeXml(config.avsandareContact.name)}</ku:Namn>`);
  lines.push(`      <ku:Telefon>${escapeXml(config.avsandareContact.phone)}</ku:Telefon>`);
  lines.push(`      <ku:Epostadress>${escapeXml(config.avsandareContact.email)}</ku:Epostadress>`);
  lines.push(
    `      <ku:Utdelningsadress1>${escapeXml(
      config.avsandareContact.address1 ?? "",
    )}</ku:Utdelningsadress1>`,
  );
  lines.push(
    `      <ku:Postnummer>${escapeXml(config.avsandareContact.postNumber ?? "")}</ku:Postnummer>`,
  );
  lines.push(`      <ku:Postort>${escapeXml(config.avsandareContact.postCity ?? "")}</ku:Postort>`);
  lines.push("    </ku:TekniskKontaktperson>");
  lines.push(`    <ku:Skapad>${escapeXml(created)}</ku:Skapad>`);
  lines.push("  </ku:Avsandare>");
  lines.push("  <ku:Blankettgemensamt>");
  lines.push("    <ku:Uppgiftslamnare>");
  lines.push(
    `      <ku:UppgiftslamnarePersOrgnr>${escapeXml(orgNr)}</ku:UppgiftslamnarePersOrgnr>`,
  );
  lines.push("      <ku:Kontaktperson>");
  lines.push(`        <ku:Namn>${escapeXml(config.uppgiftslamnareContact.name)}</ku:Namn>`);
  lines.push(`        <ku:Telefon>${escapeXml(config.uppgiftslamnareContact.phone)}</ku:Telefon>`);
  lines.push(
    `        <ku:Epostadress>${escapeXml(config.uppgiftslamnareContact.email)}</ku:Epostadress>`,
  );
  lines.push(
    `        <ku:Sakomrade>${escapeXml(
      config.uppgiftslamnareContact.sakomrade ?? "",
    )}</ku:Sakomrade>`,
  );
  lines.push("      </ku:Kontaktperson>");
  lines.push("    </ku:Uppgiftslamnare>");
  lines.push("  </ku:Blankettgemensamt>");

  entries.forEach((entry) => {
    lines.push(`  <ku:Blankett nummer="2314">`);
    lines.push("    <ku:Arendeinformation>");
    lines.push(`      <ku:Arendeagare>${escapeXml(orgNr)}</ku:Arendeagare>`);
    lines.push(`      <ku:Period>${reportingYear}</ku:Period>`);
    lines.push("    </ku:Arendeinformation>");
    lines.push("    <ku:Blankettinnehall>");
    lines.push("      <ku:KU65>");
    lines.push("        <ku:UppgiftslamnareKU65>");
    lines.push(
      `          <ku:UppgiftslamnarId faltkod="201">${escapeXml(orgNr)}</ku:UppgiftslamnarId>`,
    );
    lines.push(
      `          <ku:NamnUppgiftslamnare faltkod="202">${escapeXml(
        config.orgName,
      )}</ku:NamnUppgiftslamnare>`,
    );
    lines.push("        </ku:UppgiftslamnareKU65>");
    lines.push(`        <ku:Inkomstar faltkod="203">${reportingYear}</ku:Inkomstar>`);
    lines.push(
      `        <ku:MottagetGavobelopp faltkod="621">${entry.amount}</ku:MottagetGavobelopp>`,
    );
    lines.push(
      `        <ku:Specifikationsnummer faltkod="570">${entry.specNumber}</ku:Specifikationsnummer>`,
    );
    lines.push("        <ku:InkomsttagareKU65>");
    lines.push(`          <ku:Inkomsttagare faltkod="215">${entry.person}</ku:Inkomsttagare>`);
    lines.push("        </ku:InkomsttagareKU65>");
    lines.push("      </ku:KU65>");
    lines.push("    </ku:Blankettinnehall>");
    lines.push("  </ku:Blankett>");
  });

  lines.push("</Skatteverket>");

  return lines.join("\n");
}
