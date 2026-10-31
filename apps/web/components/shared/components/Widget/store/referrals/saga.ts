import { SagaIterator } from "redux-saga";
import { call, put, select } from "redux-saga/effects";
import { Action } from "typescript-fsa";
import { ReferralData, ReferralType } from "../../types/Temp";
import { submitReferralRequest, widgetTrpc } from "../widgetApi";
import { State } from "../state";
import { fetchReferralsAction, submitReferralAction } from "./actions";

export function* fetchReferrals(action: Action<undefined>): SagaIterator<void> {
  try {
    const referralTypes: ReferralType[] = yield call(() =>
      widgetTrpc().widget.referralTypes.query(),
    );

    yield put(
      fetchReferralsAction.done({
        params: action.payload,
        result: referralTypes as [ReferralType],
      }),
    );
  } catch (ex) {
    yield put(fetchReferralsAction.failed({ params: action.payload, error: ex as Error }));
  }
}

export function* submitReferral(action: Action<ReferralData>): SagaIterator<void> {
  const registrationToken = yield select((state: State) => state.donation.registrationToken);
  const donorID = yield select((state: State) => state.donation.donor?.donorID);
  const websiteSession = yield select((state: State) => state.referrals.websiteSession);

  try {
    const data = {
      referralID: action.payload.referralID,
      registrationToken,
      donorID,
      active: action.payload.active,
      comment: action.payload.comment,
      session: websiteSession,
    };

    yield call(submitReferralRequest, data);

    yield put(
      submitReferralAction.done({
        params: action.payload,
        result: true,
      }),
    );
  } catch (ex) {
    yield put(submitReferralAction.failed({ params: action.payload, error: ex as Error }));
  }
}
