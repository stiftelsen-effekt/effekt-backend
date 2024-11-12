import { Router } from "express";
import { DAO } from "../custom_modules/DAO";

export const agreementfeedbackRouter = Router();

agreementfeedbackRouter.get("/types", async (req, res, next) => {
  try {
    const types = await DAO.agreementfeedback.getAllStoppedAgreementReasons();

    res.json({
      status: 200,
      content: types,
    });
  } catch (err) {
    next(err);
  }
});

agreementfeedbackRouter.post("/stopped", async (req, res, next) => {
  try {
    const { reasonId, agreementId, agreementType } = req.body as {
      reasonId: number;
      agreementId: string;
      agreementType: "avtalegiro" | "autogiro" | "vipps";
    };

    let avtaleGiroAgreementId: number | null = null;
    let autogiroAgreementId: number | null = null;
    let vippsAgreementId: string | null = null;

    switch (agreementType) {
      case "avtalegiro":
        avtaleGiroAgreementId = parseInt(agreementId);
        break;
      case "autogiro":
        autogiroAgreementId = parseInt(agreementId);
        break;
      case "vipps":
        vippsAgreementId = agreementId;
        break;
    }

    const insertedId = await DAO.agreementfeedback.addStoppedAgreementReasonRecord(
      reasonId,
      avtaleGiroAgreementId,
      autogiroAgreementId,
      vippsAgreementId,
    );

    if (insertedId === -1) {
      res.status(400).json({ message: "Failed to add record" });
      return;
    } else {
      res.json({
        status: 200,
        content: insertedId,
      });
    }
  } catch (err) {
    next(err);
  }
});
