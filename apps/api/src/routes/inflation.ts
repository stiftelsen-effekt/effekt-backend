import express from "express";
import { DAO } from "../custom_modules/DAO";
import type { AgreementInflationAdjustment } from "../custom_modules/DAO_modules/inflationadjustment";
import { agreementType } from "../custom_modules/inflationadjustment";
import config from "../config";
import { escapeHtml } from "./fundraisers";

const vipps = require("../custom_modules/vipps");
export const inflationRouter = express.Router();

const successUrl = () => `${config.frontend_url}/${config.inflation_adjustment_success_slug}`;
const errorUrl = () => `${config.frontend_url}/${config.inflation_adjustment_error_slug}`;

/** Tokens are 32 random bytes as hex (see inflationadjustments.createAdjustment) */
const isToken = (token: string) => /^[0-9a-f]{64}$/.test(token);

const isExpired = (adjustment: AgreementInflationAdjustment) =>
  new Date(adjustment.expires).getTime() <= Date.now();

const formatKroner = (ore: number) =>
  (ore / 100).toLocaleString("nb-NO", { maximumFractionDigits: 2 }) + " kr";

function confirmationPage(adjustment: AgreementInflationAdjustment) {
  const current = escapeHtml(formatKroner(adjustment.current_amount));
  const proposed = escapeHtml(formatKroner(adjustment.proposed_amount));
  return `<!DOCTYPE html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Bekreft nytt beløp</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; color: #000; background: #fff; }
      button { font: inherit; padding: 0.75rem 1.5rem; border: 1px solid #000; background: #000; color: #fff; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Bekreft nytt beløp</h1>
    <p>Den faste donasjonen din endres fra ${current} til ${proposed} per måned.</p>
    <form method="post">
      <button type="submit">Bekreft</button>
    </form>
  </body>
</html>`;
}

/**
 * The link in the inflation adjustment email. Only shows a confirmation page: link scanners
 * and previews fetch links with GET, so the change itself is made by the page's POST.
 */
inflationRouter.get("/agreement-update/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!isToken(token)) return res.redirect(302, errorUrl());

    const adjustment = await DAO.inflationadjustments.getByToken(token);
    if (!adjustment) {
      console.error(`Inflation adjustment not found for the given token`);
      return res.redirect(302, errorUrl());
    }
    if (adjustment.status === "accepted") return res.redirect(302, successUrl());
    if (adjustment.status !== "pending" || isExpired(adjustment)) {
      console.error(`Inflation adjustment ${adjustment.ID} is ${adjustment.status} or expired`);
      return res.redirect(302, errorUrl());
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- only formatted numbers are interpolated, HTML-escaped, and the page has a no-script CSP
    res.send(confirmationPage(adjustment));
  } catch (ex) {
    next({ ex });
  }
});

/**
 * Applies the adjustment. The adjustment is claimed first (pending and not expired, in one
 * UPDATE), so a repeated or concurrent submit can't apply it twice. If the agreement can't be
 * updated, the claim is released so the donor can try again.
 */
inflationRouter.post("/agreement-update/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!isToken(token)) return res.redirect(303, errorUrl());

    const claimed = await DAO.inflationadjustments.acceptAdjustment(token);
    if (!claimed) {
      const adjustment = await DAO.inflationadjustments.getByToken(token);
      if (adjustment?.status === "accepted") return res.redirect(303, successUrl());
      console.error(`Inflation adjustment could not be accepted (missing, not pending or expired)`);
      return res.redirect(303, errorUrl());
    }

    const adjustment = await DAO.inflationadjustments.getByToken(token);
    let applied = false;
    try {
      applied = adjustment != null && (await applyAdjustment(adjustment));
    } catch (ex) {
      console.error(ex);
    }
    if (!applied) {
      await DAO.inflationadjustments.releaseAcceptedAdjustment(token);
      return res.redirect(303, errorUrl());
    }

    res.redirect(303, successUrl());
  } catch (ex) {
    next({ ex });
  }
});

/** Updates the agreement's amount. Returns false if it was not changed. */
async function applyAdjustment(adjustment: AgreementInflationAdjustment): Promise<boolean> {
  const type = adjustment.agreement_type.toLowerCase();

  if (type === agreementType.avtaleGiro.toLowerCase()) {
    const agreement = await DAO.avtalegiroagreements.getByID(parseInt(adjustment.agreement_ID));
    if (!agreement) {
      console.error(`AvtaleGiro agreement ${adjustment.agreement_ID} not found`);
      return false;
    }
    const success = await DAO.avtalegiroagreements.updateAmount(
      agreement.KID,
      adjustment.proposed_amount,
    );
    if (!success) {
      console.error(`Failed to update amount for AvtaleGiro agreement ${adjustment.agreement_ID}`);
    }
    return success;
  }

  if (type === agreementType.vipps.toLowerCase()) {
    const updatedWithVipps = await vipps.updateAgreementPrice(
      adjustment.agreement_ID,
      adjustment.proposed_amount, // ØRE
    );
    if (!updatedWithVipps) {
      console.error(`Failed to update amount with Vipps for agreement ${adjustment.agreement_ID}`);
      return false;
    }
    const updatedAgreement = await DAO.vipps.updateAgreementPrice(
      adjustment.agreement_ID,
      adjustment.proposed_amount / 100, // KR
    );
    if (!updatedAgreement) {
      // The price is already changed with Vipps, so the adjustment stays accepted
      console.error(
        `Updated Vipps agreement ${adjustment.agreement_ID} with Vipps, but not in the DB`,
      );
    }
    return true;
  }

  // AutoGiro is not adjusted (see getAllInflationEligibleAgreements); none were ever proposed
  console.error(
    `Unsupported agreement type for inflation adjustment: ${adjustment.agreement_type}`,
  );
  return false;
}
