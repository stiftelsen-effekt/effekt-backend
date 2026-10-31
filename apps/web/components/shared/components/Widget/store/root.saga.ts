import { all, takeLatest, takeLeading } from "redux-saga/effects";
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

// Registering a donation and drafting an agreement use takeLeading: a repeat dispatch while one
// is in flight is ignored. takeLatest would cancel the saga but not its HTTP request, so a double
// click registered the donation twice.
export function* watchAll() {
  yield all([
    takeLatest(fetchCauseAreasAction.started.type, fetchCauseAreas),
    takeLatest(fetchReferralsAction.started.type, fetchReferrals),
    takeLeading(registerDonationAction.started.type, registerDonation),
    takeLatest(submitReferralAction.started.type, submitReferral),
    takeLeading(registerBankPendingAction.started.type, registerBankPending),
    takeLeading(draftAgreementAction.started.type, draftVippsAgreement),
    takeLeading(draftAvtaleGiroAction.started.type, draftAvtaleGiro),
  ]);
}
