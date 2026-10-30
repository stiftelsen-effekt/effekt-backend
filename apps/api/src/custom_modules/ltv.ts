import { DAO } from "./DAO";
import type { AgreementReport } from "./DAO_modules/avtalegiroagreements";
import type { VippsAgreementReport } from "./DAO_modules/vipps";

export type LtvEstimate = { label: string; expectedLtv: number; median: number | null };

/**
 * The latest expected lifetime value of a recurring AvtaleGiro and Vipps donor, with the median
 * agreement sum of each (REST GET /ltv/recentestimate and tRPC site.ltvEstimate). The website
 * reports a new agreement's predicted value to Plausible and Facebook with it. Null if there is no
 * estimate.
 */
export async function getRecentLtvEstimates(): Promise<LtvEstimate[] | null> {
  const latestLtv = await DAO.results.getRecentLTV();
  const avtaleGiroReport = await DAO.avtalegiroagreements.getAgreementReport();
  const vippsReport = await DAO.vipps.getAgreementReport();

  if (!latestLtv) return null;

  return latestLtv.map((ltv) => ({
    label: ltv.Label,
    expectedLtv: ltv.Expected_LTV,
    median: getMedian(avtaleGiroReport, vippsReport, ltv.Label),
  }));
}

const getMedian = (
  avtaleGiroReport: AgreementReport | false,
  vippsReport: VippsAgreementReport | false,
  label: string,
): number | null => {
  if (label === "AvtaleGiro") {
    if (!avtaleGiroReport) {
      return null;
    }
    return parseFloat(avtaleGiroReport.medianAgreementSum);
  } else if (label === "Vipps") {
    if (!vippsReport) {
      return null;
    }
    return parseFloat(vippsReport.medianAgreementSum ?? "");
  } else {
    return null;
  }
};
