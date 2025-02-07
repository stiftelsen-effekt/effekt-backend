import { parse } from "csv-parse/sync";

export type AdoveoFundraiserTransactionReportRow = {
  date: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  amount: string;
  status: "SALE" | "RESERVED" | "PAID";
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
   *  senderName: 'John Doe',
   *  senderEmail: 'john-doe@example.com',
   *  senderPhone: '00123456789',
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
      if (field === "senderEmail" && (row[field] == "null" || row[field] == "" || !row[field])) {
        row[field] = "adoveo+unknown@gieffektivt.no";
      }

      if (field === "senderName" && (row[field] == "null" || row[field] == "" || !row[field])) {
        row[field] = "Adoveo Unknown";
      }

      if (!row[field]) {
        console.error("Parsing adoveo transactions failed. Missing field " + field);
        throw new Error("Parsing adoveo transactions failed. Missing field " + field);
      }
    }
    if (row.status !== "SALE" && row.status !== "RESERVED" && row.status !== "PAID") {
      console.error("Parsing adoveo transactions failed. Unknown status " + row.status);
      throw new Error("Parsing adoveo transactions failed. Unknown status " + row.status);
    }
  }

  return data;
};

export type AdoveoGiftCardsTransactionReportRow = {
  date: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  message: string;
  amount: string;
  status: "SALE" | "RESERVED" | "PAID";
  location: string;
  couponSend: string;
};

export const parseGiftCardsReport = (report): AdoveoGiftCardsTransactionReportRow[] => {
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
      console.error("Parsing adoveo gift card transactions failed.");
      throw new Error(ex);
    }
  }

  /**
   * Verify that the parsed data conforms to the following format:
   * {
   *  date: '2023-11-12 13:21:56',
   *  senderName: 'John Doe',
   *  senderEmail: 'john-doe@example.com',
   *  senderPhone: '00123456789',
   *  receiverName: 'Fride Brorstad Nilsen',
   *  receiverPhone: '0047922922129',
   *  message: 'Takk for at du er du!',
   *  amount: '200',
   *  status: 'SALE',
   *  location: '(banner)',
   *  couponSend: 'true'
   * }
   * */

  const requiredFields = [
    "date",
    "senderName",
    "senderEmail",
    "senderPhone",
    "receiverName",
    "receiverPhone",
    "message",
    "amount",
    "status",
    "location",
    "couponSend",
  ];

  for (let row of data) {
    for (let field of requiredFields) {
      if (field === "senderEmail" && (row[field] == "null" || row[field] == "" || !row[field])) {
        row[field] = "adoveo+unknown@gieffektivt.no";
      }
      if ((field === "receiverEmail" && row[field] == "null") || row[field] == "" || !row[field]) {
        row[field] = "adoveo+unknown@gieffektivt.no";
      }
      if (field === "senderName" && (row[field] == "null" || row[field] == "" || !row[field])) {
        row[field] = "Adoveo Unknown";
      }
      if ((field === "receiverName" && row[field] == "null") || row[field] == "" || !row[field]) {
        row[field] = "Adoveo Unknown";
      }

      if (!row[field]) {
        console.error("Parsing adoveo gift card transactions failed. Missing field " + field);
        throw new Error("Parsing adoveo gift card transactions failed. Missing field " + field);
      }
    }
    if (row.status !== "SALE" && row.status !== "RESERVED" && row.status !== "PAID") {
      console.error("Parsing adoveo gift card transactions failed. Unknown status " + row.status);
      throw new Error("Parsing adoveo gift card transactions failed. Unknown status " + row.status);
    }
  }

  return data;
};
