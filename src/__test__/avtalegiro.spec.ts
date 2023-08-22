import bodyParser from "body-parser";
import { expect } from "chai";
import express from "express";
import { DateTime } from "luxon";
import sinon from "sinon";
import request from "supertest";
import config from "../config";
import * as avtalegiro from "../custom_modules/avtalegiro";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import * as mail from "../custom_modules/mail";

describe("avtalegiro", () => {
  describe("generateAvtaleGiroFile()", () => {
    let donorStub;
    let file;
    let getLines;
    let getSubString;

    const mockAgreements = [
      {
        id: 1,
        KID: "002556289731589",
        claimDate: 10,
        amount: 50000,
        notice: true,
        active: true,
      },
      {
        id: 2,
        KID: "000638723319577",
        claimDate: 10,
        amount: 340000,
        notice: false,
        active: true,
      },
      {
        id: 3,
        KID: "000675978627833",
        claimDate: 10,
        amount: 5000000,
        notice: true,
        active: true,
      },
    ];

    beforeEach(function () {
      donorStub = sinon.stub(DAO.donors, "getByKID");

      donorStub.withArgs("002556289731589").resolves({
        name: "Maria Brækkelie",
      });
      donorStub.withArgs("000638723319577").resolves({
        name: "Kristian Jørgensen",
      });
      donorStub.withArgs("000675978627833").resolves({
        name: "Håkon Harnes",
      });

      config.nets_customer_id = "00230456";

      getLines = () => {
        let lines = file.toString("utf-8").split("\n");
        // Pop last empty line
        lines.pop();
        return lines;
      };

      getSubString = (row, start, length) => {
        const lines = getLines();
        const line = lines[row - 1];
        return line.substr(start - 1, length);
      };
    });

    it("Has correct overall structure", async () => {
      file = await avtalegiro.generateAvtaleGiroFile(
        42,
        mockAgreements,
        DateTime.fromJSDate(new Date("2021-10-10 10:00")),
      );

      expect(getLines().length).to.be.equal(14);

      /**
       * Start record
       */
      expect(getSubString(1, 1, 2)).to.be.equal("NY");
      expect(getSubString(1, 3, 2)).to.be.equal("00");
      expect(getSubString(1, 5, 2)).to.be.equal("00");
      expect(getSubString(1, 7, 2)).to.be.equal("10");
      expect(getSubString(1, 9, 8)).to.be.equal("00230456");
      expect(getSubString(1, 17, 7)).to.be.equal("0000042");
      expect(getSubString(1, 24, 8)).to.be.equal("00008080");

      /**
       * End record
       */
      expect(getSubString(14, 1, 2)).to.be.equal("NY");
      expect(getSubString(14, 3, 2)).to.be.equal("00");
      expect(getSubString(14, 5, 2)).to.be.equal("00");
      expect(getSubString(14, 7, 2)).to.be.equal("89");
      expect(getSubString(14, 9, 8)).to.be.equal("00000003");
      expect(getSubString(14, 17, 8)).to.be.equal("00000014");
      expect(getSubString(14, 25, 17)).to.be.equal("00000000005390000");
      expect(getSubString(14, 42, 6)).to.be.equal("101021");
    });

    it("Has correct number of assignments", async () => {
      file = await avtalegiro.generateAvtaleGiroFile(
        42,
        mockAgreements,
        DateTime.fromJSDate(new Date("2021-10-10 10:00")),
      );

      // Assignment 1
      expect(getSubString(2, 1, 8)).to.be.equal("NY210020");
      expect(getSubString(5, 1, 8)).to.be.equal("NY210088");

      // Assignment 2
      expect(getSubString(6, 1, 8)).to.be.equal("NY210020");
      expect(getSubString(9, 1, 8)).to.be.equal("NY210088");

      // Assignment 3
      expect(getSubString(10, 1, 8)).to.be.equal("NY210020");
      expect(getSubString(13, 1, 8)).to.be.equal("NY210088");
    });

    it("Has correct structure on assignment wrappers", async () => {
      // Testing assignment 2

      // Start record assignment
      // Assignment nr.
      expect(getSubString(6, 18, 7)).to.be.equal(`0420001`);
      // Our bank account nr.
      expect(getSubString(6, 25, 11)).to.be.equal("15062995960");

      // End record assignment
      // No. of transactions, expected to just be one
      expect(getSubString(9, 9, 8)).to.be.equal("00000001");
      // No. of records in assignment, expected to be four
      expect(getSubString(9, 17, 8)).to.be.equal("00000004");
      // Total sum of transactions
      expect(getSubString(9, 25, 17)).to.be.equal("00000000000340000");
      // First due date of transactions
      expect(getSubString(9, 42, 6)).to.be.equal("101021");
      // Last due date of transactions
      expect(getSubString(9, 48, 6)).to.be.equal("101021");
    });

    it("Has correct structure on payment claim in assignment", async () => {
      // Testing assignment 3

      // Line 1
      expect(getSubString(11, 1, 8)).to.be.equal("NY210230");
      // Transaction number
      expect(getSubString(11, 9, 7)).to.be.equal("0000001");
      // Due date
      expect(getSubString(11, 16, 6)).to.be.equal("101021");
      // Sum
      expect(getSubString(11, 33, 17)).to.be.equal("00000000005000000");
      // KID
      expect(getSubString(11, 50, 25)).to.be.equal("          000675978627833");
      // Filler
      expect(getSubString(11, 75, 6)).to.be.equal("000000");

      // Line 2
      expect(getSubString(12, 1, 8)).to.be.equal("NY210231");
      // Transaction number
      expect(getSubString(12, 9, 7)).to.be.equal("0000001");
      // Short name
      expect(getSubString(12, 16, 10)).to.be.equal(" HÅKONHARN");
      // Filler
      expect(getSubString(12, 76, 5)).to.be.equal("00000");
    });
  });

  describe("getDueDates()", () => {
    it("Calculates correct due dates for a normal week", () => {
      // Monday 8th of May 2023
      const date = DateTime.fromJSDate(new Date("2023-05-08 10:00"));
      const dueDates = avtalegiro.getDueDates(date);

      expect(dueDates.length).to.be.equal(1);
      expect(dueDates[0].toISODate()).to.be.equal("2023-05-12");
    });

    it("Calculates correct due dates for a week with a holiday", () => {
      // Monday 1st of May 2023
      const date = DateTime.fromJSDate(new Date("2023-05-01 10:00"));
      const dueDates = avtalegiro.getDueDates(date);

      expect(dueDates.length).to.be.equal(0);
    });

    it("Calculates correct due dates for a week with a holiday and a weekend", () => {
      // Friday 28th of April 2023
      const date = DateTime.fromJSDate(new Date("2023-04-28 10:00"));
      const dueDates = avtalegiro.getDueDates(date);

      expect(dueDates.length).to.be.equal(1);
      expect(dueDates[0].toISODate()).to.be.equal("2023-05-05");
    });

    it("Returns due dates for all the days in a period of april / may 2023", () => {
      // Iterate over all the days in May 2023 and add them to a list
      const dueDates = [];
      let date = DateTime.fromJSDate(new Date("2023-04-28 10:00"));
      while (date <= DateTime.fromJSDate(new Date("2023-05-23 10:00"))) {
        let claimDueDates = avtalegiro.getDueDates(date);
        dueDates.push(...claimDueDates);
        date = date.plus({ days: 1 });
      }
      dueDates.sort((a, b) => a.toMillis() - b.toMillis());

      expect(dueDates.length).to.be.equal(26);
      // Expect the due dates to be unique in the list
      expect(dueDates).to.be.deep.equal([...new Set(dueDates)]);
      // Expect all the dates from 05.05.2023 to 30.05.2023 to be in the list
      expect(dueDates.map((d) => d.toFormat("dd.MM.yyyy"))).to.be.deep.equal([
        "05.05.2023",
        "06.05.2023",
        "07.05.2023",
        "08.05.2023",
        "09.05.2023",
        "10.05.2023",
        "11.05.2023",
        "12.05.2023",
        "13.05.2023",
        "14.05.2023",
        "15.05.2023",
        "16.05.2023",
        "17.05.2023",
        "18.05.2023",
        "19.05.2023",
        "20.05.2023",
        "21.05.2023",
        "22.05.2023",
        "23.05.2023",
        "24.05.2023",
        "25.05.2023",
        "26.05.2023",
        "27.05.2023",
        "28.05.2023",
        "29.05.2023",
        "30.05.2023",
      ]);
    });

    it("Returns due dates for christmas 2023", () => {
      // Iterate over all the days from 10.12.2023 to 10.01.2024 and add them to a list
      const dueDates = [];
      let date = DateTime.fromJSDate(new Date("2023-12-10 10:00"));
      while (date <= DateTime.fromJSDate(new Date("2024-01-10 10:00"))) {
        let claimDueDates = avtalegiro.getDueDates(date);
        dueDates.push(...claimDueDates);
        date = date.plus({ days: 1 });
      }
      dueDates.sort((a, b) => a.toMillis() - b.toMillis());

      expect(dueDates.length).to.be.equal(33);
      // Expect the due dates to be unique in the list
      expect(dueDates).to.be.deep.equal([...new Set(dueDates)]);
      // Expect all the dates from 15.12.2023 to 15.01.2024 to be in the list
      expect(dueDates.map((d) => d.toFormat("dd.MM.yyyy"))).to.be.deep.equal([
        "15.12.2023",
        "16.12.2023",
        "17.12.2023",
        "18.12.2023",
        "19.12.2023",
        "20.12.2023",
        "21.12.2023",
        "22.12.2023",
        "23.12.2023",
        "24.12.2023",
        "25.12.2023",
        "26.12.2023",
        "27.12.2023",
        "28.12.2023",
        "29.12.2023",
        "30.12.2023",
        "31.12.2023",
        "01.01.2024",
        "02.01.2024",
        "03.01.2024",
        "04.01.2024",
        "05.01.2024",
        "06.01.2024",
        "07.01.2024",
        "08.01.2024",
        "09.01.2024",
        "10.01.2024",
        "11.01.2024",
        "12.01.2024",
        "13.01.2024",
        "14.01.2024",
        "15.01.2024",
        "16.01.2024",
      ]);
    });
  });

  describe("routes", () => {
    let server: express.Express;

    beforeEach(async () => {
      server = express();
      server.use(bodyParser.json());
      server.use(bodyParser.urlencoded({ extended: true }));

      sinon.stub(authMiddleware, "checkAvtaleGiroAgreement").callsFake((KID, req, res, next) => {
        next();
      });
      sinon.stub(authMiddleware, "auth").returns([]);

      const { default: avtalegiroRouter } = await import("../routes/avtalegiro");
      server.use("/avtalegiro", avtalegiroRouter);
    });

    describe("POST /:KID/distribution", () => {
      let donorStub: sinon.SinonStub;
      let standardSplitStub: sinon.SinonStub;
      let distributionsKIDExistsStub: sinon.SinonStub;
      let replaceDistributionStub: sinon.SinonStub;
      let sendAvtaleGiroChangeStub: sinon.SinonStub;

      const defaultBody = {
        distribution: {
          taxUnit: {},
          standardDistribution: true,
        },
      };

      beforeEach(() => {
        donorStub = sinon.stub(DAO.donors, "getByKID");
        standardSplitStub = sinon.stub(DAO.organizations, "getStandardSplit");
        distributionsKIDExistsStub = sinon.stub(DAO.distributions, "KIDexists");
        replaceDistributionStub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution");
        sendAvtaleGiroChangeStub = sinon.stub(mail, "sendAvtaleGiroChange");
      });

      function withDonor(donor: Partial<Awaited<ReturnType<typeof DAO.donors.getByKID>>> | null) {
        donorStub.resolves(donor);
      }

      function withStandardSplit(
        standardSplit: Partial<
          Awaited<ReturnType<typeof DAO.organizations.getStandardSplit>>
        > | null,
      ) {
        standardSplitStub.resolves(standardSplit);
      }

      function withKIDExisting(exists: boolean) {
        distributionsKIDExistsStub.resolves(exists);
      }

      beforeEach(() => {
        withDonor({
          id: 1,
        });
        withStandardSplit([
          {
            id: 1,
            name: "Test",
            share: 100,
          },
        ]);
      });

      it("should return 200", async () => {
        await request(server)
          .post("/avtalegiro/123456789/distribution")
          .send(defaultBody)
          .expect(200);
      });

      it("should send avtalegiro change", async () => {
        const KID = "123456789";
        await request(server).post(`/avtalegiro/${KID}/distribution`).send(defaultBody).expect(200);

        expect(sendAvtaleGiroChangeStub.calledOnce).to.be.true;
        expect(sendAvtaleGiroChangeStub.firstCall.args[0]).to.be.equal(KID);
        expect(sendAvtaleGiroChangeStub.firstCall.args[1]).to.be.equal("SHARES");
      });

      it("should replace avtalegiro distribution with standard split", async () => {
        const standardSplit = [
          {
            id: 1,
            name: "Test",
            share: 100,
          },
        ];
        withStandardSplit(standardSplit);
        await request(server).post(`/avtalegiro/123/distribution`).send(defaultBody).expect(200);

        expect(replaceDistributionStub.calledOnce).to.be.true;
        expect(replaceDistributionStub.firstCall.args[2]).to.be.equal(standardSplit);
      });

      it("should replace distribution with custom split", async () => {
        const customDistribution = [
          {
            id: 5,
            share: 100,
          },
        ];
        await request(server)
          .post(`/avtalegiro/123/distribution`)
          .send({
            ...defaultBody,
            distribution: {
              ...defaultBody.distribution,
              standardDistribution: false,
              shares: customDistribution,
            },
          })
          .expect(200);

        expect(replaceDistributionStub.calledOnce).to.be.true;
        expect(replaceDistributionStub.firstCall.args[2]).to.deep.equal(customDistribution);
      });

      it("should return 400 if empty custom split", async () => {
        await request(server)
          .post(`/avtalegiro/123/distribution`)
          .send({
            ...defaultBody,
            distribution: {
              ...defaultBody.distribution,
              standardDistribution: false,
              shares: [],
            },
          })
          .expect(400);
      });

      it("should return 400 custom split doesn't add up to 100", async () => {
        await request(server)
          .post(`/avtalegiro/123/distribution`)
          .send({
            ...defaultBody,
            distribution: {
              ...defaultBody.distribution,
              standardDistribution: false,
              shares: [
                {
                  id: 5,
                  share: 50,
                },
              ],
            },
          })
          .expect(400);
      });
    });
  });

  afterEach(() => {
    sinon.restore();
  });
});
