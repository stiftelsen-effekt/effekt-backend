import { CauseArea } from "../types/CauseArea";
import { PaymentMethod, RecurringDonation, ShareType } from "../types/Enums";
import { ReferralType } from "../types/Temp";

export interface State {
  donation: Donation;
  layout: Layout;
  referrals: Referrals;
}

export interface Layout {
  paneNumber: number;
  /** A registration or agreement draft is in flight: the buttons show a spinner and ignore clicks */
  loading: boolean;
  causeAreas?: CauseArea[];
}

export interface DonationInput {
  method?: PaymentMethod;
  recurring: RecurringDonation;
  donor: Donor;
  dueDay: number;
  vippsAgreement: VippsAgreement;
}

export interface Donation extends DonationInput {
  kid?: string;
  /** From registerDonation: sent with the calls that act on the registered KID */
  registrationToken?: string;
  paymentProviderURL?: string;
  /** UI selection: 'single' = one cause area, 'multiple' = all cause areas */
  selectionType?: "single" | "multiple";
  /** When selectionType is 'single', the selected cause area ID */
  selectedCauseAreaId?: number;
  /** UI-entered amounts per cause area (NOK) */
  causeAreaAmounts?: Record<number, number>;
  /** UI-selected wether a cause area is standard split */
  causeAreaDistributionType?: Record<number, ShareType>;
  /** UI-entered amounts per organization (NOK), keyed by organization ID */
  orgAmounts?: Record<number, number>;
  /** Organization percentage shares (0-100) prefilled from an external entry point (e.g.
   * the organizations list, or a CMS-configured distribution link), keyed by organization ID */
  prefilledShares?: Record<number, number> | null;
  /** Whether the donor has revealed the full organization list beyond the prefilled one */
  showAllOrganizations?: boolean;
  /** Whether the donor has manually edited the prefilled organization's amount (stops it auto-tracking the cause area total) */
  hasManuallyEditedPrefilledOrgAmount?: boolean;
  /** Smart distribution total amount (NOK) - when selectedCauseAreaId === -1 */
  smartDistributionTotal?: number;
  /** Whether global operations cut is enabled (for multiple cause areas) */
  globalOperationsEnabled?: boolean;
  /** Whether operations cut is in percentage mode (true) or custom amount mode (false) for each cause area */
  operationsPercentageModeByCauseArea?: Record<number, boolean>;
  /** Global operations percentage value (0-100) */
  globalOperationsPercentage?: number;
  /** Operations percentage values by cause area (0-100) */
  operationsPercentageByCauseArea?: Record<number, number>;
  /** Widget configuration for operations */
  operationsConfig?: {
    operationsCauseAreaId?: number;
    defaultPercentage: number;
    enabledByDefaultGlobal: boolean;
    enabledByDefaultSingle: boolean;
    excludedCauseAreaIds: number[];
  };
  // Separate API error state
  apiError?: string | null;
  /** Optional campaign/matching referral code, from the donor pane or ?referral= */
  referralCode?: string;
  /** What the donor last entered in the donor pane, kept so it survives the pane unmounting.
   * Never sent to the API, the registration only reads `donor`. */
  donorFormDraft?: DonorFormDraft;
}

export interface VippsAgreement {
  initialCharge: boolean;
  monthlyChargeDay: number;
}

export interface DonorInput {
  name?: string;
  email?: string;
  taxDeduction: boolean;
  ssn?: string;
  newsletter: boolean;
  dueDay?: number;
}

export interface Donor extends DonorInput {
  donorID?: number;
}

export interface Referrals {
  referrals?: ReferralType[];
  selectedReferrals: number[];
  otherText: string;
  websiteSession: string;
}

export interface DonorFormDraft {
  isAnonymous: boolean;
  name: string;
  email: string;
  ssn: string;
  taxDeduction: boolean;
  newsletter: boolean;
  method: PaymentMethod;
  privacyPolicy: boolean;
  referralCode: string;
}
