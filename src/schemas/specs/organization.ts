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
     *   "id": 1,
     *   "causeAreaId": 1,
     *   "standardShare": "100",
     *   "name": "GiveWell",
     *   "shortDescription": "This is GiveWell's top charities fund",
     *   "longDescription": "This is a longer description about GiveWell and their top charities fund",
     *   "informationUrl": "https://gieffektivt.no/givewell/",
     *   "isActive": true,
     *   "ordering": 1
     * }
     */
    Organization: {
      /** @description The organization id */
      id: number;
      /** @description The cause area id the organization belongs to */
      causeAreaId: number;
      /** @description The standard share within the cause area */
      standardShare?: number;
      /** @description The organization name */
      name: string;
      /** @description The organization abbreviation */
      abbreviation?: string;
      /** @description The organization short description */
      shortDescription?: string;
      /** @description The organization long description */
      longDescription?: string;
      /** @description The organization information url */
      informationUrl?: string;
      /** @description Whether the organization is active or not */
      isActive: boolean;
      /** @description The ordering of the organization within the cause area (used for sorting frontend) */
      ordering: number;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export type external = Record<string, never>;

export type operations = Record<string, never>;