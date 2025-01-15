import express from "express";
import { DAO } from "../custom_modules/DAO";
import { api_url } from "../config";
import { DateTime } from "luxon";
import { RequestLocale } from "../middleware/locale";

export const tidbytRouter = express.Router();

const formatNumber = (number: number): string =>
  Intl.NumberFormat("no-NO", { maximumFractionDigits: 2 })
    .format(number)
    .replace(/\u00A0/g, " ");

const rightAlign = (title: string, value: string): { title: string; value: string } => {
  // We know the font is monospaced, at width 4, and we know the display is width 64
  // Add spaces to the value to right align it
  const titleLength = title.length;
  const valueLength = value.length;
  const spaces = " ".repeat((60 - titleLength * 4 - valueLength * 4) / 4);
  return { title, value: `${spaces}${value}` };
};

tidbytRouter.get("/agreements/avtalegiro", async (req, res, next) => {
  try {
    const report = await DAO.avtalegiroagreements.getAgreementReport();

    if (report) {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Avtalegiro",
        data: [
          {
            ...rightAlign("Active", formatNumber(report.activeAgreementCount)),
            color: "FFFFFF",
          },
          {
            ...rightAlign("Sum", formatNumber(report.totalAgreementSum)),
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Failed to get Avtalegiro report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
      title_image: `${api_url}/static/scroll.png`,
      title_text: "Failed to get Avtalegiro report",
      data: [
        {
          title: "Error",
          value: ex.toString(),
          color: "FFFFFF",
        },
      ],
    });
  }
});

tidbytRouter.get("/agreements/vipps", async (req, res, next) => {
  try {
    const report = await DAO.vipps.getAgreementReport();

    if (report) {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/vipps`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Vipps",
        data: [
          {
            ...rightAlign("Active", formatNumber(report.activeAgreementCount)),
            color: "FFFFFF",
          },
          {
            ...rightAlign("Sum", formatNumber(report.totalAgreementSum)),
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/vipps`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Failed to get Vipps report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/agreements/vipps`,
      title_image: `${api_url}/static/scroll.png`,
      title_text: "Failed to get Vipps report",
      data: [
        {
          title: "Error",
          value: ex.toString(),
          color: "FFFFFF",
        },
      ],
    });
  }
});

tidbytRouter.get("/donations/month", async (req, res, next) => {
  try {
    const report = await DAO.donations.getAll(
      {
        id: "sum",
        desc: true,
      },
      0,
      3,
      {
        date: {
          from: DateTime.now().minus({ days: 30 }).toJSDate(),
          to: DateTime.now().toJSDate(),
        },
      },
      RequestLocale.NO,
    );

    if (report) {
      // Three biggest donations
      const largestString = report.rows
        .map(
          (donation, i) =>
            `${i + 1}. ${formatNumber(Math.round(donation.sum))} (${DateTime.fromJSDate(
              donation.timestamp,
            ).toFormat("LLL dd")})`,
        )
        .join(" | ");

      return res.json({
        feed_url: `${api_url}/tidbyt/donations/month`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "30 days",
        data: [
          {
            ...rightAlign("Num", formatNumber(report.statistics.numDonations)),
            color: "FFFFFF",
          },
          {
            ...rightAlign("Sum", formatNumber(Math.round(report.statistics.sumDonations))),
            color: "FFFFFF",
          },
          {
            title: "Largest",
            value: largestString,
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/donations/month`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/month`,
      title_image: `${api_url}/static/scroll.png`,
      title_text: "Failed to get donation report",
      data: [
        {
          title: "Error",
          value: ex.toString(),
          color: "FFFFFF",
        },
      ],
    });
  }
});

tidbytRouter.get("/donations/week", async (req, res, next) => {
  try {
    const report = await DAO.donations.getAll(
      {
        id: "sum",
        desc: true,
      },
      0,
      3,
      {
        date: {
          from: DateTime.now().minus({ days: 7 }).toJSDate(),
          to: DateTime.now().toJSDate(),
        },
      },
      RequestLocale.NO,
    );

    if (report) {
      // Three biggest donations
      const largestString = report.rows
        .map(
          (donation, i) =>
            `${i + 1}. ${formatNumber(Math.round(donation.sum))} (${DateTime.fromJSDate(
              donation.timestamp,
            ).toFormat("LLL dd")})`,
        )
        .join(" | ");

      return res.json({
        feed_url: `${api_url}/tidbyt/donations/total`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "7 days",
        data: [
          {
            ...rightAlign("Num", formatNumber(report.statistics.numDonations)),
            color: "FFFFFF",
          },
          {
            ...rightAlign("Sum", formatNumber(Math.round(report.statistics.sumDonations))),
            color: "FFFFFF",
          },
          {
            title: "Largest",
            value: largestString,
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/donations/total`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/total`,
      title_image: `${api_url}/static/scroll.png`,
      title_text: "Failed to get donation report",
      data: [
        {
          title: "Error",
          value: ex.toString(),
          color: "FFFFFF",
        },
      ],
    });
  }
});

tidbytRouter.get("/donations/total", async (req, res, next) => {
  try {
    const report = await DAO.donations.getAll(
      {
        id: "sum",
        desc: true,
      },
      0,
      3,
      {},
      RequestLocale.NO,
    );

    if (report) {
      // Three biggest donations
      const largestString = report.rows
        .map(
          (donation, i) =>
            `${i + 1}. ${formatNumber(Math.round(donation.sum))} (${DateTime.fromJSDate(
              donation.timestamp,
            ).toFormat("LLL dd yyyy")})`,
        )
        .join(" | ");

      return res.json({
        feed_url: `${api_url}/tidbyt/donations/total`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "All time",
        data: [
          {
            ...rightAlign("Num", formatNumber(report.statistics.numDonations)),
            color: "FFFFFF",
          },
          {
            ...rightAlign("Sum", formatNumber(Math.round(report.statistics.sumDonations))),
            color: "FFFFFF",
          },
          {
            title: "Largest",
            value: largestString,
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/donations/total`,
        title_image: `${api_url}/static/scroll.png`,
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/total`,
      title_image: `${api_url}/static/scroll.png`,
      title_text: "Failed to get donation report",
      data: [
        {
          title: "Error",
          value: ex.toString(),
          color: "FFFFFF",
        },
      ],
    });
  }
});
