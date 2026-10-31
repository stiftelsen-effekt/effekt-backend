import { all, takeLatest } from "redux-saga/effects";
import {
  draftAgreementAction,
  draftAvtaleGiroAction,
  registerBankPendingAction,
  registerDonationAction,
} from "./donation/actions";
import {
  draftAvtaleGiro,
  draftVippsAgreement,
  registerBankPending,
  registerDonation,
} from "./donation/saga";
import { fetchReferralsAction, submitReferralAction } from "./referrals/actions";
import { fetchReferrals, submitReferral } from "./referrals/saga";
import { fetchCauseAreasAction } from "./layout/actions";
import { fetchCauseAreas } from "./layout/saga";

export function* watchAll() {
  yield all([
    takeLatest(fetchCauseAreasAction.started.type, fetchCauseAreas),
    takeLatest(fetchReferralsAction.started.type, fetchReferrals),
    takeLatest(registerDonationAction.started.type, registerDonation),
    takeLatest(submitReferralAction.started.type, submitReferral),
    takeLatest(registerBankPendingAction.started.type, registerBankPending),
    takeLatest(draftAgreementAction.started.type, draftVippsAgreement),
    takeLatest(draftAvtaleGiroAction.started.type, draftAvtaleGiro),
  ]);
}
