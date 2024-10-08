/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export type paths = Record<string, never>;

export type webhooks = Record<string, never>;

export interface components {
  schemas: {
    /**
     * @example {
     *   "id": 178,
     *   "status": 1,
     *   "donorId": 237,
     *   "full_name": "Jack Torrance",
     *   "KID": 12347489220,
     *   "timestamp_created": "1921-07-04T23:00:00.000Z",
     *   "monthly_charge_day": 5,
     *   "force_charge_date": 0,
     *   "paused_until_date": "1921-10-04T23:00:00.000Z",
     *   "amount": 200,
     *   "agreement_url_code": "1hj3hik52hk4jl728j2gj91l0yjkujjkwokds25oi"
     * }
     */
    VippsAgreement: {
      /** @description The Auto-generated id of a agreement */
      id: number;
      /** @description If the agreement is active or not */
      status: boolean;
      /** @description The id of the donor attached to the agreement */
      donorId: number;
      /** @description Full name of the donor (first and last name) */
      full_name: string;
      /** @description The KID number for the agreement */
      KID: string;
      /**
       * Format: date-time
       * @description Timestamp for when the agreement were created
       */
      timestamp_created: string;
      /** @description Day of the month when charged */
      monthly_charge_day: number;
      /** @description Guarantee that a payment occurs on one specified date if true */
      force_charge_date: boolean;
      /**
       * Format: date-time
       * @description The date the agreement is paused to
       */
      paused_until_date?: string;
      /** @description Amount for the payment agreement */
      amount: number;
      /** @description A 41 character string that identifies the agreement */
      agreement_url_code: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type $defs = Record<string, never>;

export type external = Record<string, never>;

export type operations = Record<string, never>;
