import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import {
  sendDonationRegistered,
  sendAvtalegiroNotification,
  sendFacebookTaxConfirmation,
  sendTaxYearlyReportNoticeNoUser,
  sendTaxYearlyReportNoticeWithUser,
  sendDonorMissingTaxUnitNotice,
  sendSanitySecurityNotice,
  send100millionsolicitation,
  sendDonorCloseToTaxDeductionTreshold,
} from "../custom_modules/mail";

import express from "express";
const router = express.Router();
const authMiddleware = require("../custom_modules/authorization/authMiddleware");

router.post("/donation/registered", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const KID = req.body.KID;
    const sum = req.body.sum;

    await sendDonationRegistered(KID, sum);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/avtalegiro/notice", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const KID = req.body.KID;
    const agreement = await DAO.avtalegiroagreements.getByKID(KID);

    let claimDate: DateTime = null;
    const now = DateTime.local();

    if (agreement.paymentDate > now.day) {
      claimDate = DateTime.local(now.year, now.month, agreement.paymentDate);
    } else {
      claimDate = DateTime.local(now.year, now.month, agreement.paymentDate).plus({ month: 1 });
    }

    await sendAvtalegiroNotification(agreement, claimDate);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/facebook/tax/confirmation", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const recipient = req.body.recipient;
    const name = req.body.name;
    const paymentID = req.body.paymentID;

    await sendFacebookTaxConfirmation(recipient, name, paymentID);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post(
  "/taxreport/notice",
  /*authMiddleware.isAdmin, */ async (req, res, next) => {
    try {
      const reportsWithUserOnProfilePage = await DAO.tax.getReportsWithUserOnProfilePage();
      const reportsWithoutUserOnProfilePage = []; //await DAO.tax.getReportsWithoutUserOnProfilePage();

      let successfullySent = 0;
      let failedToSend = 0;

      // Batch send to all users with profile page, maximum 10 at a time
      // Using Promise.all to send all at once
      let results = [];
      const totalEmails =
        reportsWithUserOnProfilePage.length + reportsWithoutUserOnProfilePage.length;
      while (successfullySent + failedToSend < totalEmails) {
        const promises = [];
        const MAX_CONCURRENT = 10;

        console.log(
          `Batch sending ${MAX_CONCURRENT} reports (total: ${
            successfullySent + failedToSend
          }) (success: ${successfullySent}) (failed: ${failedToSend})...`,
        );

        for (let i = 0; i < MAX_CONCURRENT; i++) {
          if (reportsWithUserOnProfilePage.length > 0) {
            const report = reportsWithUserOnProfilePage.pop();
            promises.push(sendTaxYearlyReportNoticeWithUser(report));
          } else if (reportsWithoutUserOnProfilePage.length > 0) {
            const report = reportsWithoutUserOnProfilePage.pop();
            promises.push(sendTaxYearlyReportNoticeNoUser(report));
          } else {
            break;
          }
        }

        const results = await Promise.allSettled(promises);
        results.forEach((result) => {
          results.push(result);
          if (result.status === "fulfilled") {
            successfullySent++;
          } else {
            console.error("Failed to send", result.reason);
            failedToSend++;
          }
        });
      }

      res.json({
        status: 200,
        content: {
          success: successfullySent,
          failed: failedToSend,
          results: results,
        },
      });
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * Sends a notice to all donors that are eligible for tax deduction in the given year
 * Specify a list of emails to exclude from the notice, a tax year (usually the year before the current year)
 * and a minimum sum for the donations in the given year to qualify for tax deduction (500 for 2023 f.ex.)
 */
router.post("/notice/missingtaxunit", authMiddleware.isAdmin, async (req, res, next) => {
  const { excludedEmails, year, minSum } = req.body;
  if (!year || !minSum) {
    res.status(400).json({
      status: 400,
      content: "Missing parameters year or minSum",
    });
    return;
  }

  const donorsWithDonationsMissingTaxUnit = await DAO.tax.getDonorsEligableForDeductionInYear(
    year,
    minSum,
    excludedEmails,
  );

  let successfullySent = 0;
  let failedToSend = 0;
  const totalEmails = donorsWithDonationsMissingTaxUnit.length;

  // Batch send to all donors, maximum 10 at a time
  // Using Promise.all to send all at once
  let results = [];
  while (successfullySent + failedToSend < totalEmails) {
    const promises = [];
    const MAX_CONCURRENT = 10;

    console.log(
      `Batch sending ${MAX_CONCURRENT} reports (total: ${
        successfullySent + failedToSend
      }) (success: ${successfullySent}) (failed: ${failedToSend})...`,
    );

    for (let i = 0; i < MAX_CONCURRENT; i++) {
      if (donorsWithDonationsMissingTaxUnit.length > 0) {
        const donor = donorsWithDonationsMissingTaxUnit.pop();
        promises.push(sendDonorMissingTaxUnitNotice(donor, year));
      } else {
        break;
      }
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result) => {
      results.push(result);
      if (result.status === "fulfilled") {
        successfullySent++;
      } else {
        console.error("Failed to send", result.reason);
        failedToSend++;
      }
    });
  }

  res.json({
    status: 200,
    content: {
      success: successfullySent,
      failed: failedToSend,
      results: results,
    },
  });
});

router.post(
  "/solicitation/100million",
  /* authMiddleware.isAdmin ,*/ async (req, res, next) => {
    try {
      const email = req.body.email;

      const donors = await DAO.donors.getDonorsWithDonationsBeforeYearButNotAfter(2024);

      const sentBatch1 = [
        16005, 16915, 978, 15778, 2054, 16510, 60, 2606, 14663, 497, 16493, 213, 15974, 16334,
        14824, 16652, 1597, 686, 2043, 1832, 432, 2063, 1354, 3173, 2600, 16007, 2278, 2729, 258,
        16180, 2303, 16723, 8560, 16357, 2197, 8570, 480, 16302, 14967, 16527, 146, 658, 15387,
        16902, 2345, 15530, 365, 2638, 997, 369, 425, 2621, 1972, 16720, 1667, 2023, 8695, 958, 868,
        1863, 552, 2671, 2905, 14735, 2041, 14791, 15135, 15946, 2890, 492, 2896, 16820, 3176, 2544,
        16301, 271, 16371, 15794, 16659, 579, 1828, 8576, 2689, 15961, 169, 15686, 16776, 2741,
        2277, 16815, 1760, 14888, 16602, 418, 16726, 16755, 16933, 16885, 203, 3001,
      ];
      const sentBatch2 = [
        15555, 2903, 2949, 1820, 834, 2224, 16580, 2344, 1021, 595, 3029, 2668, 16818, 2295, 16612,
        16063, 1883, 15411, 15893, 14585, 1884, 3054, 16795, 16952, 1881, 2874, 16875, 655, 14707,
        16856, 1736, 3135, 13931, 82, 702, 15782, 8585, 16893, 295, 16702, 16805, 1223, 2333, 16547,
        1861, 16925, 2937, 1865, 734, 16220, 1629, 1886, 8559, 1986, 463, 16444, 16335, 16537,
        16421, 14960, 2996, 16070, 15040, 565, 15540, 1119, 15455, 1757, 1643, 1664, 2472, 2478,
        14784, 2243, 16299, 2902, 16305, 15104, 3110, 2885, 16288, 1122, 569, 278, 2072, 16410,
        16366, 387, 1989, 69, 2924, 1870, 2798, 1982, 366, 2170, 14823, 1625, 8663, 16990, 16905,
        55, 2730, 2653, 802, 2940, 1800, 2419, 1614, 674, 755, 8640, 863, 506, 3177, 14021, 609,
        2775, 2185, 14799, 16501, 2900, 16430, 16796, 15089, 16854, 8690, 16897, 8667, 8616, 15745,
        851, 1541, 16316, 1313, 1958, 2958, 1768, 16628, 2206, 16459, 616, 3160, 8603, 2773, 1740,
        15511, 1809, 522, 903, 15543, 16930, 945, 16947, 14594, 2793, 16651, 16827, 1777, 3068,
        1962, 2770, 2473, 904, 16134, 16798, 2452, 15112, 8654, 16693, 1814, 223, 527, 2778, 1887,
        16701, 2642, 8698, 16810, 16692, 2722, 440, 1785, 2154, 1754, 2235, 2727, 1632, 13924,
        14869, 16837, 2334, 1807, 270, 14763, 2093, 16198, 15904, 2087, 2568, 16521, 1860, 16369,
        3155, 584, 883, 2704, 15960, 87, 15772, 2772, 16747, 846, 1750, 16617, 15125, 224, 15783,
        2483, 8701, 14882, 16157, 15547, 15428, 16251, 14690, 296, 2214, 130, 16551, 16712, 721,
        14968, 15429, 1315, 2176, 715, 16048, 267, 16512, 16691, 847, 16879, 1922, 16792, 15939,
        2925, 3080, 15531, 161, 2541, 1621, 104, 348, 3042, 2329, 16739, 720, 14702, 14025, 2984,
        2871, 1696, 1723, 558, 16136, 3012, 2554, 1706, 16314, 286, 363, 16293, 442, 16388, 2077,
        2824, 16341, 13920, 2537, 16917, 262, 8666, 2973, 8662, 16696, 8675, 16272, 15427, 2972,
        2164, 246, 2216, 386, 16023, 15802, 8691, 1616, 516, 16808, 15518, 16318, 1709, 342, 2499,
        647, 2784, 147, 3127, 257, 15691,
      ];
      const sentBatch3 = [
        16621, 555, 16600, 16650, 16265, 1825, 16823, 16337, 204, 503, 1790, 2844, 16656, 250, 2498,
        2632, 14657, 1362, 15467, 1437, 16594, 2724, 16711, 2580, 2062, 16259, 2487, 16666, 2746,
        15992, 849, 14705, 2558, 921, 8646, 1051, 1609, 1715, 16801, 1655, 2800, 16715, 16904, 942,
        16087, 14015, 16522, 14873, 16754, 15966, 2652, 14601, 358, 14777, 1681, 131, 980, 119, 359,
        16603, 16846, 16089, 16520, 1815, 16494, 8558, 16367, 8670, 16140, 14780, 16016, 727, 356,
        16620, 16849, 8687, 15108, 16643, 16663, 1752, 1773, 13917, 16609, 2841, 1398, 2825, 16572,
        2916, 15887, 8709, 1433, 710, 1911, 1462, 1361, 905, 1905, 16638, 2610, 16900, 8599, 14691,
        16606, 16137, 2750, 2771, 16276, 2573, 179, 249, 1890, 15993, 2596, 15873, 16631, 16523,
        14636, 3156, 16794, 16043, 917, 2396, 3179, 2892, 1118, 16771, 16383, 2415, 559, 91, 2509,
        2802, 1652, 190, 14029, 16015, 16503, 2557, 16743, 2444, 264, 589, 16624, 2736, 16394,
        16526, 2196, 360, 968, 14612, 2803, 1948, 2869, 2910, 909, 2155, 401, 14794, 911, 16724,
        15985, 1770, 16766, 1749, 16428, 1804, 16732, 2367, 15517, 407, 15558, 16788, 2356, 1639,
        15895, 695, 2298, 15127, 1926, 15115, 2218, 16874, 14836, 2883, 2667, 15441, 14796, 16826,
        488, 2821, 2745, 1702, 16091, 2655, 2986, 212, 1846, 15522, 16274, 1719, 519, 1799, 2511,
        31, 1544, 2515, 2832, 2366, 2830, 1857, 16210, 2456, 16832, 219, 853, 2836, 2786, 724,
        17583, 15035, 433, 1854, 1872, 2753, 2951, 14783, 2936, 1747, 793, 14792, 15981, 2471, 732,
        41, 16456, 2100, 2362, 16845, 16395, 260, 14716, 1776, 1927, 15419, 1940, 2631, 15976, 2555,
        2430, 16468, 2191, 767, 16966, 920, 292, 537, 16066, 8684, 1559, 16934, 2403, 2966, 16417,
        349, 2848, 3138, 3095, 14692, 8652, 16660, 8638, 15529, 891, 177, 2263, 711, 2470, 1912,
        805, 2738, 16214, 16591, 491, 2347, 16062, 16008, 598, 3093, 972, 3170, 15462, 2368, 16761,
        608, 126, 8556, 14747, 16167, 1897, 15458, 1746, 2445, 16787, 2081, 2569, 144, 1876, 16876,
        16541, 14844, 2317, 1353, 14819, 16010, 16324, 10614, 2922, 1920, 1241, 693, 16267, 1163,
        723, 14733, 16513, 2904, 14806, 3035, 2974, 691, 2039, 16049, 9919, 16645, 2528, 16303,
        1879, 534, 326, 8674, 16601, 912, 590, 8612, 298, 629, 2810, 16841, 2930, 16113, 2998,
        16516, 640, 2920, 34, 2622, 16446, 53, 15463, 977, 8641, 2839, 16806, 16734, 1960, 733, 704,
        2975, 3082, 120, 2497, 510, 1850, 16750, 430, 14849, 254, 16331, 1120, 2855, 15684, 1279,
        2783, 2843, 16615, 2281, 2514, 2350, 8656, 2805, 487, 2071, 2146, 3152, 16330, 844, 2630,
        66, 2712, 14736, 15515, 2315, 56, 16748, 3055, 2807, 681, 2469, 656, 283, 14012, 2065, 2833,
        927, 155, 3027, 195, 193, 8577, 869, 16629, 15655, 1651, 16068, 8682, 2335, 16669, 16658,
        2074, 2159, 16753, 183, 2304, 2182, 8679, 2462, 1838, 16928, 1873, 1867, 929, 15528, 1852,
        88, 16109, 14798, 16681, 15433, 8648, 1627, 15514, 16461, 16661, 3041, 16321, 2225, 16684,
        1357, 2866, 15742, 16969, 16034, 2788, 16785, 8712, 1935, 16145, 16918, 300, 2307, 16533,
        963, 14864, 16387, 2475, 1699, 866, 16317, 653, 15766, 15133, 2501, 16554, 2491, 1936, 600,
        633, 16351, 1908, 202, 2339, 3019, 16297, 16525, 86, 2684, 2477, 16791, 8647, 472,
      ];

      const alreadySent = [...sentBatch1, ...sentBatch2, ...sentBatch3];

      const filteredDonors = donors.filter((donor) => !alreadySent.includes(donor.ID));

      const donorSubset = filteredDonors.slice(0, 500);

      /*
      for (const donor of donorSubset) {
        console.log(`Sending solicitation to ${donor.email} with ID ${donor.ID}`);
        // Sleep for 200ms to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
        await send100millionsolicitation(donor.email);
      }
      */

      res.json({
        status: 200,
        content: donorSubset,
      });
    } catch (ex) {
      next(ex);
    }
  },
);

router.post("/mailersend/survey/response", async (req, res, next) => {
  try {
    const surveyResponse = req.body.data as SurveyEmail;

    let DonorID = await DAO.donors.getIDbyEmail(surveyResponse.email.recipient.email);

    if (!DonorID) {
      DonorID = 1464; // Anonymous donor
    }

    if (!surveyResponse.surveys) {
      res.json({
        status: 200,
        content: "No surveys found in email",
      });
      return;
    }

    for (let survey of surveyResponse.surveys) {
      for (let answer of survey.answers) {
        await DAO.mail.saveMailerSendSurveyResponse({
          surveyID: parseInt(survey.survey_id),
          questionID: parseInt(survey.question_id),
          DonorID: DonorID,
          answer: answer.answer,
          answerID: answer.answer_id,
        });
      }
    }

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * Sends email when a sensitive field in sanity is updated
 */
export type SanitySecurityNoticeVariables = {
  document: string;
  fields: {
    name: string;
    prev: string;
    new: string;
  }[];
  sanityUser: string;
};

router.post("/mailersend/security/sanitynotification", async (req, res, next) => {
  try {
    if (!req.body) {
      res.status(400).json({
        status: 400,
        content: "No request body",
      });
      return;
    }
    if (!req.body.fields || !req.body.document || !req.body.sanityUser) {
      res.status(400).json({
        status: 400,
        content: "Missing required fields in request body",
      });
      return;
    }
    if (!Array.isArray(req.body.fields)) {
      res.status(400).json({
        status: 400,
        content: "Fields must be an array",
      });
      return;
    }
    if (req.body.fields.some((field) => !field.name || !field.prev || !field.new)) {
      res.status(400).json({
        status: 400,
        content: "Missing required property on object in fields array",
      });
      return;
    }

    const variables: SanitySecurityNoticeVariables = {
      document: req.body.document,
      fields: req.body.fields,
      sanityUser: req.body.sanityUser,
    };

    const success = await sendSanitySecurityNotice(variables);

    if (success) {
      res.json({
        status: 200,
        content: "OK",
      });
    } else {
      res.status(500).json({
        status: 500,
        content: "Failed to send email",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.get("/taxdeduction/close", authMiddleware.isAdmin, async (req, res, next) => {
  return res.status(403).json({
    status: 403,
    content:
      "Temporarily disabled, main pitfall is that we don't track if we've already sent the email to the donors.",
  });

  if (!req.query.year) {
    res.status(400).json({
      status: 400,
      content: "Missing year query parameter",
    });
    return;
  }
  if (!req.query.min) {
    res.status(400).json({
      status: 400,
      content: "Missing min query parameter",
    });
    return;
  }
  if (!req.query.max) {
    res.status(400).json({
      status: 400,
      content: "Missing max query parameter",
    });
    return;
  }
  const { year, min, max } = req.query;

  if (typeof year !== "string" || isNaN(parseInt(year as string))) {
    res.status(400).json({
      status: 400,
      content: "Year must be a number",
    });
    return;
  }
  if (typeof min !== "string" || isNaN(parseInt(min as string))) {
    res.status(400).json({
      status: 400,
      content: "Min must be a number",
    });
    return;
  }
  if (typeof max !== "string" || isNaN(parseInt(max as string))) {
    res.status(400).json({
      status: 400,
      content: "Max must be a number",
    });
    return;
  }

  const closeToLimit = await DAO.tax.getDonorsCloseToDeductionLimit(
    parseInt(year as string),
    parseInt(min as string),
    parseInt(max as string),
  );

  /*
  for (const donor of closeToLimit) {
    // Note that 500 is the minimum sum for tax deduction in 2024, this may change in the future
    await sendDonorCloseToTaxDeductionTreshold(donor.Donor_ID, donor.total_donations, 500, donor.num_tax_units);
  }
  */

  return res.json({
    status: 200,
    content: closeToLimit,
  });
});

module.exports = router;

// Mailersend survey post body type

type EmailObject = {
  object: string;
  id: string;
  created_at: string;
  from: string;
  subject: string;
  status: string;
  tags: string | null;
  preview_url: string;
  template: {
    object: string;
    id: string;
    url: string;
  };
  message: {
    object: string;
    id: string;
    created_at: string;
  };
  recipient: {
    object: string;
    id: string;
    email: string;
    created_at: string;
  };
};

type Answer = {
  answer: string;
  answer_id: string;
  image?: string;
};

type Rule = {
  $$hashKey: string;
  answered: string;
  collapsed: boolean;
  question_index: number;
  specific_answer: number;
  specific_answer_value: string;
  action: string;
  action_question_index: number;
};

type Survey = {
  survey_location_url: string;
  survey_id: string;
  question_id: string;
  question_index: number;
  question_type: string;
  question: string;
  next_question_index: number;
  answers: Answer[];
  rules: Rule[];
  correct_answers_rate: number;
  is_last_question: boolean;
};

type SurveyEmail = {
  email: EmailObject;
  surveys: Survey[];
};
