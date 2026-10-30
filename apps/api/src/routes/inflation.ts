import express from "express";
import { DAO } from "../custom_modules/DAO";
import { agreementType } from "../custom_modules/inflationadjustment";
import config from "../config";

const vipps = require("../custom_modules/vipps");
export const inflationRouter = express.Router();

inflationRouter.get("/agreement-update/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const adjustment = await DAO.inflationadjustments.getByToken(token);

    if (!adjustment) {
      console.error(`Adjustment with token ${token} not found`);
      return res.redirect(302, `${config.frontend_url}/${config.inflation_adjustment_error_slug}`);
    }

    if (adjustment.status === "accepted") {
      // Already accepted
      return res.redirect(
        302,
        `${config.frontend_url}/${config.inflation_adjustment_success_slug}`,
      );
    } else if (adjustment.status !== "pending") {
      console.error(`Adjustment is not pending, but ${adjustment.status}`);
      return res.redirect(302, `${config.frontend_url}/${config.inflation_adjustment_error_slug}`);
    }

    /* Now update the agreement amount */
    if (adjustment.agreement_type.toLowerCase() === agreementType.avtaleGiro.toLowerCase()) {
      const agreement = await DAO.avtalegiroagreements.getByID(parseInt(adjustment.agreement_ID));
      if (!agreement) {
        console.error(`AvtaleGiro agreement ${adjustment.agreement_ID} not found`);
        return res.redirect(
          302,
          `${config.frontend_url}/${config.inflation_adjustment_error_slug}`,
        );
      }
      const success = await DAO.avtalegiroagreements.updateAmount(
        agreement.KID,
        adjustment.proposed_amount,
      );
      if (!success) {
        console.error(
          `Failed to update agreement amount for AvtaleGiro agreement ${adjustment.agreement_ID}`,
        );
        return res.redirect(
          302,
          `${config.frontend_url}/${config.inflation_adjustment_error_slug}`,
        );
      }
    } else if (adjustment.agreement_type.toLowerCase() === agreementType.autoGiro.toLowerCase()) {
      const agreement = await DAO.autogiroagreements.getAgreementById(
        parseInt(adjustment.agreement_ID),
      );
      if (!agreement) {
        console.error(`AutoGiro agreement ${adjustment.agreement_ID} not found`);
        return res.redirect(
          302,
          `${config.frontend_url}/${config.inflation_adjustment_error_slug}`,
        );
      }
      const success = await DAO.autogiroagreements.setAgreementAmountByKID(
        agreement.KID,
        adjustment.proposed_amount,
      );
      if (!success) {
        console.error(
          `Failed to update agreement amount for autoGiro agreement ${adjustment.agreement_ID}`,
        );
        return res.redirect(
          302,
          `${config.frontend_url}/${config.inflation_adjustment_error_slug}`,
        );
      }
    } else if (adjustment.agreement_type.toLowerCase() === agreementType.vipps.toLowerCase()) {
      const updatedWithVipps = await vipps.updateAgreementPrice(
        adjustment.agreement_ID,
        adjustment.proposed_amount, // ØRE
      );
      if (!updatedWithVipps) {
        console.error(
          `Failed to update agreement amount for vipps agreement ${adjustment.agreement_ID} with Vipps`,
        );
        return res.redirect(
          302,
          `${config.frontend_url}/${config.inflation_adjustment_error_slug}`,
        );
      }
      const updatedAgreement = await DAO.vipps.updateAgreementPrice(
        adjustment.agreement_ID,
        adjustment.proposed_amount / 100, // KR
      );
      if (!updatedAgreement) {
        console.error(
          `Failed to update agreement amount for vipps agreement ${adjustment.agreement_ID} in DB, but updated with Vipps`,
        );
      }
    } else {
      console.error(`Unknown agreement type: ${adjustment.agreement_type}`);
      return res.redirect(302, `${config.frontend_url}/${config.inflation_adjustment_error_slug}`);
    }

    const success = await DAO.inflationadjustments.acceptAdjustment(token);

    if (!success) {
      console.error(`Failed to accept adjustment with token ${token}`);
      return res.redirect(302, `${config.frontend_url}/${config.inflation_adjustment_error_slug}`);
    }

    res.redirect(302, `${config.frontend_url}/${config.inflation_adjustment_success_slug}`);
  } catch (ex) {
    next({ ex });
  }
});
