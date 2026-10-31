import { describe, it, beforeAll } from "vitest";
import { expect } from "chai";
import { toDay } from "../../prisma/devdata/calendar";
import { generate, type Dataset } from "../../prisma/devdata/generate";

/** Pledges (tilsagn) in the local dev data (prisma/devdata/generate.ts › schedulePledges). */
describe("dev data: pledges", { timeout: 20000 }, function () {
  const start = toDay("2021-10-01");
  const end = toDay("2026-10-27");
  let data: Dataset;

  // Generating the dataset takes about a second alone, but several times that when the whole suite
  // runs in parallel: give the hook the same budget as the tests (the default hook timeout is 5 s)
  beforeAll(() => {
    data = generate({ seed: "effekt-dev", start, end, scale: 0.3 });
  }, 20000);

  const open = () => data.Pledges.filter((p) => p.Received_date === null);
  const received = () => data.Pledges.filter((p) => p.Received_date !== null);

  it("has open pledges of different sizes and ages, one partly paid down", () => {
    expect(open().map((p) => Number(p.Sum))).to.have.members([
      350_000, 2_500_000, 1_200_000, 750_000,
    ]);
    for (const p of open()) expect(p.Donation_ID).to.be.null;
    // The partly paid one: its first instalment is a bank donation on the donor's KID
    const partial = open().find((p) => Number(p.Sum) === 1_200_000)!;
    const instalment = data.Donations.find(
      (d) =>
        Number(d.sum_confirmed) === 800_000 &&
        String(d.timestamp_confirmed).slice(0, 10) > String(partial.Decided_date),
    );
    expect(instalment, "the 800 000 kr instalment").to.exist;
  });

  it("links received pledges to the donation that fulfilled them", () => {
    const linked = received().filter((p) => p.Donation_ID !== null);
    expect(linked).to.have.length(2);
    for (const p of linked) {
      const donation = data.Donations.find((d) => d.ID === p.Donation_ID)!;
      expect(Number(donation.sum_confirmed)).to.equal(Number(p.Sum));
      expect(String(donation.timestamp_confirmed).slice(0, 10)).to.equal(p.Received_date);
      expect(String(p.Received_date) > String(p.Decided_date)).to.be.true;
    }
    expect(received().filter((p) => p.Donation_ID === null)).to.have.length(1);
  });

  it("keeps the pledges when topped up later", () => {
    const later = generate({ seed: "effekt-dev", start, end: end + 30, scale: 0.3, anchor: end });
    expect(later.Pledges).to.deep.equal(data.Pledges);
  });
});
