import express from "express";
import { DAO } from "../custom_modules/DAO";
import { api_url } from "../config";
import { DateTime } from "luxon";

export const tidbytRouter = express.Router();

/**
 * Tidbyt JSON feeds on the following format:
 *
 * {
 *   "feed_url": "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/example.json",
 *   "title_image": "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
 *   "title_text": "Sales",
 *   "data": [
 *     {
 *       "title": "Sales",
 *       "value": "$56,854",
 *       "color": "FF0000"
 *     },
 *     {
 *       "title": "Orders",
 *       "value": "40",
 *       "color": "00FF00"
 *     },
 *     {
 *       "title": "Status",
 *       "value": "I am some long text that will scroll",
 *       "color": "0000FF"
 *     }
 *   ]
 *  }
 */

const formatNumber = (number: number): string =>
  Intl.NumberFormat("no-NO", { maximumFractionDigits: 2 }).format(number);

tidbytRouter.get("/agreements/avtalegiro", async (req, res, next) => {
  try {
    const report = await DAO.avtalegiroagreements.getAgreementReport();

    if (report) {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Avtalegiro",
        data: [
          {
            title: "Active",
            value: formatNumber(report.activeAgreementCount),
            color: "FFFFFF",
          },
          {
            title: "Sum",
            value: formatNumber(report.totalAgreementSum),
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Failed to get Avtalegiro report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/agreements/avtlaegiro`,
      title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Vipps",
        data: [
          {
            title: "Active",
            value: formatNumber(report.activeAgreementCount),
            color: "FFFFFF",
          },
          {
            title: "Sum",
            value: formatNumber(report.totalAgreementSum),
            color: "FFFFFF",
          },
        ],
      });
    } else {
      return res.json({
        feed_url: `${api_url}/tidbyt/agreements/vipps`,
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Failed to get Vipps report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/agreements/vipps`,
      title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Donations (last 30 days)",
        data: [
          {
            title: "Donations",
            value: formatNumber(report.statistics.numDonations),
            color: "FFFFFF",
          },
          {
            title: "Sum",
            value: formatNumber(Math.round(report.statistics.sumDonations)),
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/total`,
      title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Donations (last week)",
        data: [
          {
            title: "Donations",
            value: formatNumber(report.statistics.numDonations),
            color: "FFFFFF",
          },
          {
            title: "Sum",
            value: formatNumber(Math.round(report.statistics.sumDonations)),
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/total`,
      title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Donations (all time)",
        data: [
          {
            title: "Donations",
            value: formatNumber(report.statistics.numDonations),
            color: "FFFFFF",
          },
          {
            title: "Sum",
            value: formatNumber(Math.round(report.statistics.sumDonations)),
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
        title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
        title_text: "Failed to get donation report",
        data: [],
      });
    }
  } catch (ex) {
    return res.json({
      feed_url: `${api_url}/tidbyt/donations/total`,
      title_image: "https://tidbyt-json-display.s3.eu-west-1.amazonaws.com/heart.png",
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
