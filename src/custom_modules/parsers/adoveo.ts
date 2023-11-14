import { parse } from "csv-parse/sync";

export type AdoveoFundraiserTransactionReportRow = {
  date: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  amount: string;
  status: "SALE" | "RESERVED";
  location: string;
};

export const parseFundraiserReport = (report): AdoveoFundraiserTransactionReportRow[] => {
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
          console.log(header);
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
      console.error("Parsing adoveo transactions failed.");
      throw new Error(ex);
    }
  }

  /**
   * Verify that the parsed data conforms to the following format:
   * {
   *  date: '2023-11-12 13:21:56',
   *  senderName: 'Fride Nordstrand Nilsen',
   *  senderEmail: 'fride-nn@live.no',
   *  senderPhone: '004791192243',
   *  amount: '200',
   *  status: 'SALE',
   *  location: '(banner)'
   * }
   */

  const requiredFields = [
    "date",
    "senderName",
    "senderEmail",
    "senderPhone",
    "amount",
    "status",
    "location",
  ];
  for (let row of data) {
    for (let field of requiredFields) {
      if (!row[field]) {
        console.error("Parsing adoveo transactions failed. Missing field " + field);
        throw new Error("Parsing adoveo transactions failed. Missing field " + field);
      }
    }
    if (row.status !== "SALE" && row.status !== "RESERVED") {
      console.error("Parsing adoveo transactions failed. Unknown status " + row.status);
      throw new Error("Parsing adoveo transactions failed. Unknown status " + row.status);
    }
  }

  return data;
};
