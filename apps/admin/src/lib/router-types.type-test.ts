import type { RouterInputs, RouterOutputs } from "./trpc";
type IsAny<T> = 0 extends 1 & T ? true : false;
type Report = {
  donorsList: IsAny<RouterOutputs["donors"]["list"]>;
  donorRow: IsAny<RouterOutputs["donors"]["list"]["rows"][number]>;
  donation: IsAny<RouterOutputs["donations"]["get"]>;
  vippsAgreements: IsAny<RouterOutputs["vipps"]["agreements"]["list"]>;
  avtalegiroList: IsAny<RouterOutputs["giro"]["avtalegiro"]["list"]>;
  upload: IsAny<RouterOutputs["reports"]["uploads"]["ocr"]>;
  causeAreas: IsAny<RouterOutputs["config"]["causeAreas"]["listAll"]>;
  donationsListInput: IsAny<RouterInputs["donations"]["list"]>;
};
export const report: Report = {
  donorsList: false,
  donorRow: false,
  donation: false,
  vippsAgreements: false,
  avtalegiroList: false,
  upload: false,
  causeAreas: false,
  donationsListInput: false,
};
