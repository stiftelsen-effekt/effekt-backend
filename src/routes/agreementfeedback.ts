import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { auth, checkDonorOwnsDistribution } from "../custom_modules/authorization/authMiddleware";
import permissions from "../enums/authorizationPermissions";

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

agreementfeedbackRouter.post(
  "/stopped/:KID",
  auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const { reasonId, agreementId, agreementType, otherComment } = req.body as {
        reasonId: number;
        agreementId: string;
        agreementType: "Vipps" | "AvtaleGiro" | "AutoGiro";
        otherComment?: string;
      };

      let avtaleGiroAgreementId: number | null = null;
      let autogiroAgreementId: number | null = null;
      let vippsAgreementId: string | null = null;

      switch (agreementType) {
        case "AvtaleGiro":
          avtaleGiroAgreementId = parseInt(agreementId);
          break;
        case "AutoGiro":
          autogiroAgreementId = parseInt(agreementId);
          break;
        case "Vipps":
          vippsAgreementId = agreementId;
          break;
      }

      const reason = await DAO.agreementfeedback.getStoppedAgreementReasonById(reasonId);

      if (!reason) {
        res.status(400).json({ message: "Invalid reason id" });
        return;
      }

      let recordId =
        await DAO.agreementfeedback.getStoppedAgreementReasonRecordForAgreementWithin24Hours(
          agreementId,
          reasonId,
          agreementType,
        );

      if (!recordId) {
        recordId = await DAO.agreementfeedback.addStoppedAgreementReasonRecord(
          reasonId,
          avtaleGiroAgreementId,
          autogiroAgreementId,
          vippsAgreementId,
          otherComment || null,
        );
      } else if (reason.isOther) {
        await DAO.agreementfeedback.updateStoppedAgreementReasonRecord(
          recordId,
          reasonId,
          avtaleGiroAgreementId,
          autogiroAgreementId,
          vippsAgreementId,
          otherComment || null,
        );
      }

      if (recordId === -1) {
        res.status(400).json({ message: "Failed to add record" });
        return;
      } else {
        res.json({
          status: 200,
          content: recordId,
        });
      }
    } catch (err) {
      next(err);
    }
  },
);

agreementfeedbackRouter.delete(
  "/stopped/:KID/:id",
  auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      //throw new Error("Failed to delete record");

      if (!(await DAO.agreementfeedback.getStoppedAgreementReasonRecordExists(id))) {
        res.status(404).json({
          status: 404,
          message: "Record not found",
        });
        return;
      }

      const deletedId = await DAO.agreementfeedback.deleteStoppedAgreementReasonRecord(id);

      if (deletedId === -1) {
        res.status(400).json({ message: "Failed to delete record" });
        return;
      } else {
        res.json({
          status: 200,
          content: deletedId,
        });
      }
    } catch (err) {
      next(err);
    }
  },
);
