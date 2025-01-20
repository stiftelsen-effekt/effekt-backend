import { parse } from "csv-parse/sync";

export type EANTaxUnitsRow = {
  name: string;
  ssn: string;
  sum: number;
  gieffektivt: boolean;
};

export const parseEanTaxUnits = (report): EANTaxUnitsRow[] => {
  let reportText = report.toString();
  try {
    var data = parse(reportText, {
      delimiter: ",",
      bom: true,
      skip_empty_lines: true,
      columns: (header) => {
        return header.map((column) => {
          // Convert to camelCase and remove spaces
          // I.e. from Sender Name => senderName
          // First convert the first word starting letter to lowercase
          // then remove all spaces and special characters
          return column
            .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
            .replace(/[^a-zA-Z0-9]/g, "");
        });
      },
      relax_column_count: true,
      trim: true,
    });
  } catch (ex) {
    console.error("Using comma delimiter failed, trying semicolon.");

    try {
      var data = parse(reportText, {
        delimiter: ";",
        bom: true,
        skip_empty_lines: true,
        columns: (header) => {
          return header.map((column) => {
            // Convert to camelCase and remove spaces
            // I.e. from Sender Name => senderName
            // First convert the first word starting letter to lowercase
            // then remove all spaces and special characters
            return column
              .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
              .replace(/[^a-zA-Z0-9]/g, "");
          });
        },
        relax_column_count: true,
        trim: true,
      });
    } catch (ex) {
      console.error("Using semicolon delimiter failed.");
      console.error("Parsing ean tax units transactions failed.");
      throw new Error(ex);
    }
  }

  data = data.filter((row) => row.ssn !== "");

  const requiredFields = ["name", "ssn", "sum", "gieffektivt"];
  for (let row of data) {
    for (let field of requiredFields) {
      if (!row[field]) {
        console.error("Parsing ean tax units failed. Missing field " + field);
        throw new Error("Parsing ean tax units failed. Missing field " + field);
      }

      if (field === "gieffektivt") {
        if (row[field] === "ja") row[field] = true;
        else if (row[field] === "nei") row[field] = false;
        else {
          console.error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
          throw new Error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
        }
      }

      if (field === "sum") {
        row[field] = row[field].replace(/,/g, "");

        if (isNaN(parseFloat(row[field]))) {
          console.error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
          throw new Error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
        } else {
          row[field] = parseFloat(row[field]);
        }
      }

      if (field === "ssn") {
        if (row[field].length !== 11 && row[field].length !== 9) {
          console.error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
          throw new Error(
            "Parsing ean tax units failed. Invalid value for field " + field + ": " + row[field],
          );
        }
      }
    }
  }

  return data;
};
