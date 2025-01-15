import { parse } from "csv-parse/sync";

// From CSV:
// Datum,Månad,Belopp,Payment Tip,PaymentMethod,isdistributionSummatchingpayment?,Reference number ,Namn,Månadsgivare,# occurances by reference ,# occurance by name ,New ,Existing/New,Tax deduction,Personal number,Email,?,health,sci,amf,mc,hki,gd,gw,gw2,ni,dtw,catf,burn,cw,tw,climate,ec,fp,c180,il,gec,ci,asf,thl,gfi,wai,animal,fn,ace,Global hälsa,Klimat,Djurvälfärd

export type SwedishMedgivandeReportRow = {
  date: string;
  kid: string;
  name: string;
  ssn: string;
};

export const parseSwedishMedgivandeReport = (report): SwedishMedgivandeReportRow[] => {
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
            .replace(/\?/g, "unknown")
            .replace(/[^a-zA-Z0-9]/g, "");
        });
      },
      relax_column_count: true,
      trim: true,
    }) as SwedishMedgivandeReportRow[];
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
      }) as SwedishMedgivandeReportRow[];
    } catch (ex) {
      console.error("Using semicolon delimiter failed.");
      console.error("Parsing adoveo transactions failed.");
      throw new Error(ex);
    }
  }

  return data;
};
