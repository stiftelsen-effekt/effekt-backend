import { describe, it } from "vitest";
import { expect } from "chai";
import { parse } from "csv-parse/sync";
import { parseDirectAmfDonationsReport } from "../custom_modules/parsers/amf";
import { parseEanTaxUnits } from "../custom_modules/parsers/eanTaxUnits";
import { parseReport as parseTaxReport } from "../custom_modules/parsers/tax";

/**
 * Pins how csv-parse reads the report files, so an upgrade can't change what the parsers get.
 * The options are the ones the parsers in custom_modules/parsers use.
 */
const BOM = "﻿";
const plain = (delimiter: string) => ({ delimiter, bom: true, skip_empty_lines: true });
const withHeader = (delimiter: string) => ({
  ...plain(delimiter),
  columns: (header: string[]) => header.map((column) => column.replace(/[^a-zA-Z0-9]/g, "")),
  relax_column_count: true,
  trim: true,
});

describe("csv-parse characterization", () => {
  describe("the options the parsers use", () => {
    it("strips a BOM, skips empty lines and reads CRLF and quoted fields", () => {
      const text = `${BOM}a;"b;c";"say ""hi"""\r\n\r\n1;2;3\r\n`;
      expect(parse(text, plain(";"))).to.deep.equal([
        ["a", "b;c", 'say "hi"'],
        ["1", "2", "3"],
      ]);
      // The line ending is taken from the first line, so a later bare \n stays in the field
      expect(parse("a;b\r\n1;2\n\n", plain(";"))).to.deep.equal([
        ["a", "b"],
        ["1", "2\n\n"],
      ]);
    });

    it("keeps surrounding spaces and a lone field per line without trim", () => {
      expect(parse(" a , b \nc,d", plain(","))).to.deep.equal([
        [" a ", " b "],
        ["c", "d"],
      ]);
      expect(parse("a,b\nc,d", plain(";"))).to.deep.equal([["a,b"], ["c,d"]]);
    });

    it("throws on rows of different lengths unless relaxed", () => {
      expect(() => parse("a;b\n1;2;3", plain(";"))).to.throw(
        "Invalid Record Length: expect 2, got 3 on line 2",
      );
      expect(() => parse('a;"b\n1;2', plain(";"))).to.throw(/Quote Not Closed/);
    });

    it("maps headers, relaxes column counts and trims with columns", () => {
      const text = `${BOM}First Name ; Sum (NOK)\n Ada ; 1,000 \nBob\n\nCy;2;extra`;
      expect(parse(text, withHeader(";"))).to.deep.equal([
        { FirstName: "Ada", SumNOK: "1,000" },
        { FirstName: "Bob" },
        { FirstName: "Cy", SumNOK: "2" },
      ]);
    });

    it("returns nothing for an empty file", () => {
      expect(parse("", plain(";"))).to.deep.equal([]);
      expect(parse(`${BOM}\n\n`, withHeader(","))).to.deep.equal([]);
    });
  });

  describe("parsers", () => {
    it("reads tax deduction rows with semicolons", () => {
      const report = Buffer.from(`${BOM}Ada Lovelace;Ada ;ada@example.org;01010112345;1000\n\n`);
      expect(parseTaxReport(report)).to.deep.equal([
        {
          fullname: "Ada Lovelace",
          firstname: "Ada",
          email: "ada@example.org",
          ssn: "01010112345",
          amount: "1000",
        },
      ]);
    });

    it("reads EAN tax units with commas, falling back to semicolons", () => {
      const expected = [{ name: "Ada", ssn: "01010112345", sum: 1500.5, gieffektivt: true }];
      expect(
        parseEanTaxUnits(
          Buffer.from('Name,ssn,Sum,Gieffektivt\nAda , 01010112345,"1,500.50",TRUE\n,,,\n'),
        ),
      ).to.deep.equal(expected);
      expect(
        parseEanTaxUnits(Buffer.from('Name;ssn;Sum;Gieffektivt\nAda;01010112345;"1,500.50";TRUE')),
      ).to.deep.equal(expected);
    });

    it("reads AMF reports with semicolons, falling back to commas", () => {
      const row = [
        "Oct",
        "1",
        "",
        "Ada",
        "24.10.2026",
        "Oslo",
        "",
        "100",
        "10",
        "1,000 kr",
        "",
        "",
        "nets",
        "2",
        "ada@example.org",
      ];
      for (const delimiter of [";", ","]) {
        const quoted = row.map((field) => (field.includes(",") ? `"${field}"` : field));
        const result = parseDirectAmfDonationsReport(Buffer.from(quoted.join(delimiter)));
        expect(result, delimiter).to.have.length(1);
        const [transaction] = result as Exclude<typeof result, false>;
        expect(transaction.amountNOK, delimiter).to.equal(1000);
        expect(transaction.date.toISODate(), delimiter).to.equal("2026-10-24");
        expect(transaction.email, delimiter).to.equal("ada@example.org");
      }
    });
  });
});
