import { expect } from "chai";
import sinon from "sinon";
import {
  getTaxUnitsWithDeductions,
  TaxDeductionDonation,
  TaxLocale,
} from "../custom_modules/taxdeductions";
import { Tax_unit } from "@prisma/client";
import { SqlResult } from "../custom_modules/DAO";

describe("getTaxUnitsWithDeductions", () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    // Mock current date if necessary
    clock = sinon.useFakeTimers(new Date("2023-01-01").getTime());
  });

  afterEach(() => {
    clock.restore();
  });

  it("should calculate deductions correctly for NO locale", async () => {
    // Arrange
    const donations: TaxDeductionDonation[] = [
      { year: 2016, sum: 1000, taxUnitId: 1 },
      { year: 2019, sum: 1000, taxUnitId: 1 },
      { year: 2020, sum: 500, taxUnitId: 1 },
      { year: 2021, sum: 250, taxUnitId: 1 },
      { year: 2021, sum: 78000, taxUnitId: 1 },
      { year: 2022, sum: 1000, taxUnitId: 1 },
      { year: 2022, sum: 78000, taxUnitId: 1 },
    ];

    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
    ];

    const locale = TaxLocale.NO;

    // Act
    const result = getTaxUnitsWithDeductions({ donations, taxUnits, locale });

    // Assert
    expect(result).to.be.an("array");
    expect(result[0].taxDeductions).to.deep.include.members([
      { year: 2016, sumDonations: 1000, deduction: 0, benefit: 0 }, // No tax deduction for 2016 for NO
      { year: 2019, sumDonations: 1000, deduction: 1000, benefit: 220 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2020, sumDonations: 500, deduction: 500, benefit: 110 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2021, sumDonations: 78250, deduction: 50000, benefit: 11000 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2022, sumDonations: 79000, deduction: 25000, benefit: 5500 }, // Minimum 500, maximum 25000, base tax rate 22%
    ]);
  });

  it("should calculate deductions correctly for multiple tax units for NO locale", async () => {
    // Arrange
    const donations: TaxDeductionDonation[] = [
      { year: 2016, sum: 1000, taxUnitId: 1 },
      { year: 2019, sum: 1000, taxUnitId: 1 },
      { year: 2020, sum: 500, taxUnitId: 1 },
      { year: 2021, sum: 250, taxUnitId: 1 },
      { year: 2021, sum: 78000, taxUnitId: 1 },
      { year: 2022, sum: 1000, taxUnitId: 1 },
      { year: 2022, sum: 78000, taxUnitId: 1 },
      { year: 2016, sum: 1000, taxUnitId: 2 },
      { year: 2019, sum: 1000, taxUnitId: 2 },
      { year: 2020, sum: 500, taxUnitId: 2 },
      { year: 2021, sum: 250, taxUnitId: 2 },
      { year: 2021, sum: 78000, taxUnitId: 2 },
      { year: 2022, sum: 1000, taxUnitId: 2 },
      { year: 2022, sum: 12000, taxUnitId: 2 },
    ];

    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit 1",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
      {
        ID: 2,
        Donor_ID: 102,
        ssn: "12345678902",
        full_name: "Test Tax Unit 2",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
    ];

    const locale = TaxLocale.NO;

    // Act
    const result = getTaxUnitsWithDeductions({ donations, taxUnits, locale });

    // Assert
    expect(result).to.be.an("array");
    expect(result[0].taxDeductions).to.deep.include.members([
      { year: 2016, sumDonations: 1000, deduction: 0, benefit: 0 }, // No tax deduction for 2016 for NO
      { year: 2019, sumDonations: 1000, deduction: 1000, benefit: 220 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2020, sumDonations: 500, deduction: 500, benefit: 110 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2021, sumDonations: 78250, deduction: 50000, benefit: 11000 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2022, sumDonations: 79000, deduction: 25000, benefit: 5500 }, // Minimum 500, maximum 25000, base tax rate 22%
    ]);
    expect(result[1].taxDeductions).to.deep.include.members([
      { year: 2016, sumDonations: 1000, deduction: 0, benefit: 0 }, // No tax deduction for 2016 for NO
      { year: 2019, sumDonations: 1000, deduction: 1000, benefit: 220 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2020, sumDonations: 500, deduction: 500, benefit: 110 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2021, sumDonations: 78250, deduction: 50000, benefit: 11000 }, // Minimum 500, maximum 50000, base tax rate 22%
      { year: 2022, sumDonations: 13000, deduction: 13000, benefit: 2860 }, // Minimum 500, maximum 25000, base tax rate 22%
    ]);
  });

  it("should handle empty donations array", async () => {
    // Arrange
    const donations: TaxDeductionDonation[] = [];
    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
      // Add more tax units if needed
    ];
    const locale = TaxLocale.NO;

    // Act
    const result = getTaxUnitsWithDeductions({ donations, taxUnits, locale });

    // Assert
    // We expect all the tax units to be returned, and the taxDeductions array to be filled with 0 values for all years
    expect(result).to.be.an("array");
    expect(result[0].taxDeductions).to.deep.include.members([
      { year: 2016, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2017, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2018, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2019, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2020, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2021, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2022, sumDonations: 0, deduction: 0, benefit: 0 },
      { year: 2023, sumDonations: 0, deduction: 0, benefit: 0 },
    ]);
  });

  it("should throw an error for missing yearly mapping", async () => {
    // Arrange
    const futureYear = new Date().getFullYear() + 999;

    /**
     * Stub DateTime.now() to return a date in the future, so that the yearly mapping will be missing
     */
    clock.setSystemTime(new Date(futureYear, 0, 1));

    const donations: TaxDeductionDonation[] = [{ year: futureYear, sum: 1000, taxUnitId: 1 }];
    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
    ];
    const locale = TaxLocale.NO;

    // Act & Assert
    try {
      getTaxUnitsWithDeductions({ donations, taxUnits, locale });
    } catch (ex) {
      expect(ex.message).to.contain(`Missing yearly mapping for year`);
    }
  });

  it("(temporary) should throw not implemented for SE locale", async () => {
    // Arrange
    const donations: TaxDeductionDonation[] = [];
    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
    ];
    const locale = TaxLocale.SE;

    // Act & Assert
    try {
      getTaxUnitsWithDeductions({ donations, taxUnits, locale });
    } catch (ex) {
      expect(ex.message).to.contain(`Not implemented`);
    }
  });

  it("should throw for invalid locale", async () => {
    // Arrange
    const donations: TaxDeductionDonation[] = [];
    const taxUnits: SqlResult<Tax_unit>[] = [
      {
        ID: 1,
        Donor_ID: 101,
        ssn: "12345678901",
        full_name: "Test Tax Unit",
        registered: "2019-01-01T00:00:00.000Z",
        archived: null,
      },
    ];
    const locale = "invalid" as TaxLocale;

    // Act & Assert
    try {
      getTaxUnitsWithDeductions({ donations, taxUnits, locale });
    } catch (ex) {
      expect(ex.message).to.contain(`Invalid locale`);
    }
  });
});
