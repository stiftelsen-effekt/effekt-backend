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

function formatLocalDateTime(date: Date): string {
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

function normalizeOrgNr(value: string): string {
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** One XML element on its own line, with the text content escaped */
function xmlElement(
  indent: number,
  name: string,
  value: string | number,
  attributes: Record<string, string> = {},
): string {
  const attrs = Object.entries(attributes)
    .map(([key, attrValue]) => " " + key + '="' + escapeXml(attrValue) + '"')
    .join("");
  return (
    " ".repeat(indent) + "<" + name + attrs + ">" + escapeXml(String(value)) + "</" + name + ">"
  );
}

export function buildKu65Xml(config: Config, reportingYear: number, entries: Ku65Entry[]): string {
  const created = config.created ?? formatLocalDateTime(new Date());
  const schemaLocation = config.schemaLocation ?? DEFAULT_SCHEMA_LOCATION;
  const orgNr = normalizeOrgNr(config.orgNr);
  const avsandare = config.avsandareContact;
  const uppgiftslamnare = config.uppgiftslamnareContact;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push(
    '<Skatteverket xmlns="' +
      escapeXml(NS_INSTANS) +
      '" xmlns:gm="' +
      escapeXml(NS_GM) +
      '" xmlns:ku="' +
      escapeXml(NS_KU) +
      '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" omrade="Kontrolluppgifter" xsi:schemaLocation="' +
      escapeXml(schemaLocation) +
      '">',
  );
  lines.push("  <ku:Avsandare>");
  lines.push(xmlElement(4, "ku:Programnamn", config.programName));
  lines.push(xmlElement(4, "ku:Organisationsnummer", orgNr));
  lines.push("    <ku:TekniskKontaktperson>");
  lines.push(xmlElement(6, "ku:Namn", avsandare.name));
  lines.push(xmlElement(6, "ku:Telefon", avsandare.phone));
  lines.push(xmlElement(6, "ku:Epostadress", avsandare.email));
  lines.push(xmlElement(6, "ku:Utdelningsadress1", avsandare.address1 ?? ""));
  lines.push(xmlElement(6, "ku:Postnummer", avsandare.postNumber ?? ""));
  lines.push(xmlElement(6, "ku:Postort", avsandare.postCity ?? ""));
  lines.push("    </ku:TekniskKontaktperson>");
  lines.push(xmlElement(4, "ku:Skapad", created));
  lines.push("  </ku:Avsandare>");
  lines.push("  <ku:Blankettgemensamt>");
  lines.push("    <ku:Uppgiftslamnare>");
  lines.push(xmlElement(6, "ku:UppgiftslamnarePersOrgnr", orgNr));
  lines.push("      <ku:Kontaktperson>");
  lines.push(xmlElement(8, "ku:Namn", uppgiftslamnare.name));
  lines.push(xmlElement(8, "ku:Telefon", uppgiftslamnare.phone));
  lines.push(xmlElement(8, "ku:Epostadress", uppgiftslamnare.email));
  lines.push(xmlElement(8, "ku:Sakomrade", uppgiftslamnare.sakomrade ?? ""));
  lines.push("      </ku:Kontaktperson>");
  lines.push("    </ku:Uppgiftslamnare>");
  lines.push("  </ku:Blankettgemensamt>");

  entries.forEach((entry) => {
    lines.push('  <ku:Blankett nummer="2314">');
    lines.push("    <ku:Arendeinformation>");
    lines.push(xmlElement(6, "ku:Arendeagare", orgNr));
    lines.push(xmlElement(6, "ku:Period", reportingYear));
    lines.push("    </ku:Arendeinformation>");
    lines.push("    <ku:Blankettinnehall>");
    lines.push("      <ku:KU65>");
    lines.push("        <ku:UppgiftslamnareKU65>");
    lines.push(xmlElement(10, "ku:UppgiftslamnarId", orgNr, { faltkod: "201" }));
    lines.push(xmlElement(10, "ku:NamnUppgiftslamnare", config.orgName, { faltkod: "202" }));
    lines.push("        </ku:UppgiftslamnareKU65>");
    lines.push(xmlElement(8, "ku:Inkomstar", reportingYear, { faltkod: "203" }));
    lines.push(xmlElement(8, "ku:MottagetGavobelopp", entry.amount, { faltkod: "621" }));
    lines.push(xmlElement(8, "ku:Specifikationsnummer", entry.specNumber, { faltkod: "570" }));
    lines.push("        <ku:InkomsttagareKU65>");
    lines.push(xmlElement(10, "ku:Inkomsttagare", entry.person, { faltkod: "215" }));
    lines.push("        </ku:InkomsttagareKU65>");
    lines.push("      </ku:KU65>");
    lines.push("    </ku:Blankettinnehall>");
    lines.push("  </ku:Blankett>");
  });

  lines.push("</Skatteverket>");

  return lines.join("\n");
}
