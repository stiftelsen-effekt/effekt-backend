export interface IServerResponse<T> {
  status: number;
  content: T | string;
}

export interface ReferralData {
  referralID: number;
  active: boolean;
  donorID?: number;
  comment?: string;
}

export type ReferralType = {
  id: number;
  name: string;
  ordering: number;
};
