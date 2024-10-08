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
     *   "pages": 100
     * }
     */
    Pagination: {
      /** @description The number of pages for the given limit. E.g. if the client has a limit of 20 results, and there are 2000 items in the database, there would be 100 pages. */
      pages?: number;
      /** @description An array of objects depending on the route / resource */
      rows?: unknown[];
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
