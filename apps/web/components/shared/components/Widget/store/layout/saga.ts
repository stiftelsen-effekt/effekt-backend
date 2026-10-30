import { SagaIterator } from "redux-saga";
import { call, put } from "redux-saga/effects";
import { Action } from "typescript-fsa";
import { widgetTrpc } from "../widgetApi";
import { fetchCauseAreasAction } from "./actions";
import { CauseArea } from "../../types/CauseArea";

export function* fetchCauseAreas(action: Action<undefined>): SagaIterator<void> {
  try {
    // On the Danish site the REST link answers this with GET /causeareas/all/
    const causeAreas = yield call(() => widgetTrpc().widget.causeAreas.query());

    yield put(
      fetchCauseAreasAction.done({
        params: action.payload,
        result: causeAreas as CauseArea[],
      }),
    );
  } catch (ex) {
    yield put(fetchCauseAreasAction.failed({ params: action.payload, error: ex as Error }));
  }
}
