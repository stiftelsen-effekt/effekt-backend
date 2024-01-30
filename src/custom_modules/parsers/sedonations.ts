import { parse } from "csv-parse/sync";

// From CSV:
// Datum,Månad,Belopp,Payment Tip,PaymentMethod,isdistributionSummatchingpayment?,Reference number ,Namn,Månadsgivare,# occurances by reference ,# occurance by name ,New ,Existing/New,Tax deduction,Personal number,Email,?,health,sci,amf,mc,hki,gd,gw,gw2,ni,dtw,catf,burn,cw,tw,climate,ec,fp,c180,il,gec,ci,asf,thl,gfi,wai,animal,fn,ace,Global hälsa,Klimat,Djurvälfärd

export type SwedishDonationsReportRow = {
  datum: string;
  månad: string;
  belopp: string;
  paymentTip: string;
  paymentMethod: string;
  isDistributionSumMatchingPayment: string;
  referencenumber: string;
  namn: string;
  månadsgivare: string;
  occurancesByReference: string;
  occuranceByName: string;
  new: string;
  existingNew: string;
  taxDeduction: string;
  personalnumber: string;
  email: string;
  unknown: string;
  health: string;
  sci: string;
  amf: string;
  mc: string;
  hki: string;
  gd: string;
  gw: string;
  gw2: string;
  ni: string;
  dtw: string;
  catf: string;
  burn: string;
  cw: string;
  tw: string;
  climate: string;
  ec: string;
  fp: string;
  c180: string;
  il: string;
  gec: string;
  ci: string;
  asf: string;
  thl: string;
  gfi: string;
  wai: string;
  animal: string;
  fn: string;
  ace: string;
  globalhlsa: string;
  klimat: string;
  djurvlfrd: string;
  lookuphelper: string;
  nordeahits: string;
  bankid: string;
  manualbankid: string;
  finalbankid: string;
  duplicates: string;
};

export const parseSwedishDonationsReport = (report): ExtractedDonor[] => {
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
    }) as SwedishDonationsReportRow[];
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
      }) as SwedishDonationsReportRow[];
    } catch (ex) {
      console.error("Using semicolon delimiter failed.");
      console.error("Parsing adoveo transactions failed.");
      throw new Error(ex);
    }
  }

  const donors: Map<string, ExtractedDonor> = new Map();
  for (let i = 0; i < data.length; i++) {
    let row = data[i];

    if (row.email === "") {
      if (row.namn === "") {
        console.error(`No donor name or email for row ${i}`);
      } else {
        row.email = row.namn.replace(/ /g, "").toLowerCase() + "+donor@geeffektivt.se";
      }
    }

    const globalHealthKeys = ["sci", "amf", "mc", "hki", "gd", "gw", "gw2", "ni", "dtw"];
    const climateKeys = ["catf", "burn", "cw", "tw", "ec", "fp", "c180", "il", "gec", "ci"];
    const animalKeys = ["asf", "thl", "gfi", "wai", "fn", "ace"];

    const distribution = {
      unknownSum: row.unknown,
      globalHealth: {
        sum: 0,
        standardDistribution: false,
        orgs: [],
      },
      climate: {
        sum: 0,
        standardDistribution: false,
        orgs: [],
      },
      animal: {
        sum: 0,
        standardDistribution: false,
        orgs: [],
      },
      operations: {
        sum: 0,
        standardDistribution: true,
        orgs: [],
      },
    };

    for (const key of globalHealthKeys) {
      if (row[key]) {
        const amount = parseFloat(row[key].replace(/,/g, ""));
        distribution.globalHealth.orgs.push({
          name: key,
          amount,
        });
      }
    }

    for (const key of climateKeys) {
      if (row[key]) {
        const amount = parseFloat(row[key].replace(/,/g, ""));
        distribution.climate.orgs.push({
          name: key,
          amount,
        });
      }
    }

    for (const key of animalKeys) {
      if (row[key]) {
        const amount = parseFloat(row[key].replace(/,/g, ""));
        distribution.animal.orgs.push({
          name: key,
          amount,
        });
      }
    }

    if (row.paymentTip && parseFloat(row.paymentTip.replace(/,/g, "")) > 0) {
      distribution.operations.sum = parseFloat(row.paymentTip.replace(/,/g, ""));
      distribution.operations.standardDistribution = true;
      distribution.operations.orgs.push({
        name: "operations",
        amount: parseFloat(row.paymentTip.replace(/,/g, "")),
      });
    }

    const globalHealthOrgsSum = distribution.globalHealth.orgs.reduce(
      (acc, org) => acc + org.amount,
      0,
    );
    const climateOrgsSum = distribution.climate.orgs.reduce((acc, org) => acc + org.amount, 0);
    const animalOrgsSum = distribution.animal.orgs.reduce((acc, org) => acc + org.amount, 0);

    const globalHealthFileSum = parseFloat(row.globalhlsa.replace(/,/g, ""));
    const climateFileSum = parseFloat(row.klimat.replace(/,/g, ""));
    const animalFileSum = parseFloat(row.djurvlfrd.replace(/,/g, ""));

    if (globalHealthFileSum !== globalHealthOrgsSum) {
      if (globalHealthOrgsSum === 0) {
        distribution.globalHealth.standardDistribution = true;
      } else {
        // Move "health" key to "gw"
        const amount = parseFloat(row["health"].replace(/,/g, ""));
        const index = distribution.globalHealth.orgs.findIndex((org) => org.name === "gw");
        if (index !== -1) {
          distribution.globalHealth.orgs[index].amount += amount;
        } else {
          distribution.globalHealth.orgs.push({
            name: "gw",
            amount,
          });
        }

        // Recheck
        const globalHealthOrgsSum = distribution.globalHealth.orgs.reduce(
          (acc, org) => acc + org.amount,
          0,
        );
        if (globalHealthFileSum !== globalHealthOrgsSum) {
          console.error("Global health sum mismatch for row", row);
        }
      }
    }
    if (climateFileSum !== climateOrgsSum) {
      if (climateOrgsSum === 0) {
        distribution.climate.standardDistribution = true;
      } else {
        // Move "climate" key to "catf"
        const amount = parseFloat(row["climate"].replace(/,/g, ""));
        const index = distribution.climate.orgs.findIndex((org) => org.name === "catf");
        if (index !== -1) {
          distribution.climate.orgs[index].amount += amount;
        } else {
          distribution.climate.orgs.push({
            name: "catf",
            amount,
          });
        }

        // Recheck
        const climateOrgsSum = distribution.climate.orgs.reduce((acc, org) => acc + org.amount, 0);
        if (climateFileSum !== climateOrgsSum) {
          console.error("Climate sum mismatch for row", row);
        }
      }
    }
    if (animalFileSum !== animalOrgsSum) {
      if (animalOrgsSum === 0) {
        distribution.animal.standardDistribution = true;
      } else {
        // Move "animal" key to "ace"
        const amount = parseFloat(row["animal"].replace(/,/g, ""));
        const index = distribution.animal.orgs.findIndex((org) => org.name === "ace");
        if (index !== -1) {
          distribution.animal.orgs[index].amount += amount;
        } else {
          distribution.animal.orgs.push({
            name: "ace",
            amount,
          });
        }

        // Recheck
        const animalOrgsSum = distribution.animal.orgs.reduce((acc, org) => acc + org.amount, 0);
        if (animalFileSum !== animalOrgsSum) {
          console.error("Animal sum mismatch for row", row);
        }
      }
    }

    distribution.globalHealth.sum = globalHealthFileSum;
    distribution.climate.sum = climateFileSum;
    distribution.animal.sum = animalFileSum;

    if (donors.has(row.email)) {
      donors.get(row.email).donations.push({
        date: row.datum,
        paymentMethod: row.paymentMethod,
        referenceNumber: row.referencenumber,
        finalBankId: row.finalbankid,
        amount: parseFloat(row.belopp.replace(/,/g, "")),
        distribution,
      });
    } else {
      donors.set(row.email, {
        email: row.email,
        name: row.namn,
        ssn: row.personalnumber.length > 0 ? row.personalnumber : null,
        donations: [
          {
            date: row.datum,
            paymentMethod: row.paymentMethod,
            referenceNumber: row.referencenumber,
            finalBankId: row.finalbankid,
            amount: parseFloat(row.belopp.replace(/,/g, "")),
            distribution,
          },
        ],
      });
    }
  }

  // Print all donors
  let numberOfErrors = 0;
  for (const donor of donors.values()) {
    // Verify that for each donation the sum is equal to the sum of the cause areas
    for (const donation of donor.donations) {
      const sum =
        donation.distribution.globalHealth.sum +
        donation.distribution.climate.sum +
        donation.distribution.animal.sum +
        donation.distribution.operations.sum;
      if (sum !== donation.amount) {
        console.error(donor.name, donor.email);
        numberOfErrors++;
      }
    }
  }
  console.log(`Number of errors: ${numberOfErrors}`);

  return Array.from(donors.values());
};

type ExtractedDonor = {
  email: string;
  name: string;
  ssn: string | null;
  donations: ExtractedDonorDonation[];
};

export type ExtractedDonorDonation = {
  date: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string;
  finalBankId: string;
  distribution: {
    unknownSum: string;
    globalHealth: {
      sum: number;
      standardDistribution: boolean;
      orgs: {
        name: string;
        amount: number;
      }[];
    };
    climate: {
      sum: number;
      standardDistribution: boolean;
      orgs: {
        name: string;
        amount: number;
      }[];
    };
    animal: {
      sum: number;
      standardDistribution: boolean;
      orgs: {
        name: string;
        amount: number;
      }[];
    };
    operations: {
      sum: number;
      standardDistribution: boolean;
      orgs: {
        name: string;
        amount: number;
      }[];
    };
  };
};
