import { expect } from "chai";
import { isSwedishWorkingDay } from "./swedish-workdays";

describe("isSwedishWorkingDay()", () => {
  it("should return false for saturday", () => {
    const date = new Date("2023-11-04");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for sunday", () => {
    const date = new Date("2023-11-05");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for new years day", () => {
    const dates = [new Date("2023-01-01"), new Date("2024-01-01")];
    expect(dates.every(isSwedishWorkingDay)).to.be.false;
  });

  it("should return false for trettondedag jul", () => {
    const date = new Date("2023-01-06");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for skärtorsdagen", () => {
    const date = new Date("2023-04-06");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for långfredagen", () => {
    const date = new Date("2023-04-07");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for påskafton", () => {
    const date = new Date("2023-04-08");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for påskdagen", () => {
    const dates = [new Date("2022-04-17"), new Date("2023-04-09"), new Date("2024-03-31")];
    expect(dates.every(isSwedishWorkingDay)).to.be.false;
  });

  it("should return false for annandag påsk", () => {
    const date = new Date("2023-04-10");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for första maj", () => {
    const date = new Date("2023-05-01");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for kristi himmelsfärdsdag", () => {
    const date = new Date("2023-05-18");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for pingstafton", () => {
    const date = new Date("2023-05-27");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for pingstdagen", () => {
    const date = new Date("2023-05-28");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for sveriges nationaldag", () => {
    const date = new Date("2023-06-06");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for midsommarafton", () => {
    const date = new Date("2023-06-23");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for midsommardagen", () => {
    const dates = [new Date("2022-06-25"), new Date("2023-06-24"), new Date("2024-06-22")];
    expect(dates.every(isSwedishWorkingDay)).to.be.false;
  });

  it("should return false for allhelgonaafton", () => {
    const date = new Date("2023-11-03");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for alla helgons dag", () => {
    const dates = [new Date("2022-11-05"), new Date("2023-11-04"), new Date("2024-11-02")];
    expect(dates.every(isSwedishWorkingDay)).to.be.false;
  });

  it("should return false for julafton", () => {
    const date = new Date("2023-12-24");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for juldagen", () => {
    const date = new Date("2023-12-25");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for annandag jul", () => {
    const date = new Date("2023-12-26");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return false for new years eve", () => {
    const date = new Date("2023-12-31");
    expect(isSwedishWorkingDay(date)).to.be.false;
  });

  it("should return true for trettondagsafton (unless weekend)", () => {
    const dates = [new Date("2023-01-05"), new Date("2024-01-05")];
    expect(dates.every(isSwedishWorkingDay)).to.be.true;
  });

  it("should return true for valborgsmässoafton (unless weekend)", () => {
    const date = new Date("2024-04-30");
    expect(isSwedishWorkingDay(date)).to.be.true;
  });

  it("should return true for any other day", () => {
    const dates = [new Date("2022-01-03"), new Date("2022-01-04"), new Date("2044-12-30")];
    expect(dates.every(isSwedishWorkingDay)).to.be.true;
  });
});
