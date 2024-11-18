import fs from "fs";
import path from "path";

writeToJSON("/fakeDonors.json", []);
writeToJSON("/fakeDonations.json", []);
writeToJSON("/fakeTaxUnits.json", []);
writeToJSON("/fakePaymentIntents.json", []);
writeToJSON("/fakeDistributions.json", []);
writeToJSON("/fakeDistributionCauseAreas.json", []);
writeToJSON("/fakeDistributionCauseAreaOrganizations.json", []);
writeToJSON("/fakeAvtalegiroAgreements.json", []);
writeToJSON("/fakeVippsAgreements.json", []);
writeToJSON("/fakeAutoGiroAgreements.json", []);
writeToJSON("/fakeAutoGiroMandates.json", []);

function writeToJSON(pathToJSON: string, data: Object) {
  const basePath: string = path.resolve(__dirname, "json/");
  fs.writeFile(basePath + pathToJSON, JSON.stringify(data), "utf8", (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
  });
}
