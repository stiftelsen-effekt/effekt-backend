import { KU65_CONFIG } from "./config";
import {
  buildKu65Xml,
  isValidPersonnummer,
  Ku65Entry,
  normalizePersonnummer,
  parseCsvFromString,
} from "./ku65_lib";

export function buildKu65Report(csv: string, year: number): string {
  const rows = parseCsvFromString(csv);

  const invalid = rows.filter((row) => !isValidPersonnummer(row.person));
  if (invalid.length > 0) {
    const details = invalid.map((row) => `line ${row.line}: ${row.person}`).join(", ");
    throw new Error(`Invalid personnummer on ${invalid.length} row(s): ${details}`);
  }

  const aggregated = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizePersonnummer(row.person, year);
    aggregated.set(normalized, (aggregated.get(normalized) ?? 0) + row.amount);
  }

  const entries: Ku65Entry[] = Array.from(aggregated.entries()).map(([person, amount]) => ({
    person,
    amount,
    specNumber: 1,
  }));

  return buildKu65Xml({ ...KU65_CONFIG, reportingYear: year }, year, entries);
}
