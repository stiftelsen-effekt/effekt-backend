/**
 * Search providers feed the command palette (⌘K). Each provider decides from the raw query
 * whether it applies (a number could be a donor id, donation id or KID; "agr_…" is a Vipps
 * agreement; text with "@" is an email) and resolves matches. The palette runs every
 * matching provider in parallel and groups the results.
 *
 * The app registers API-backed providers (api-providers.ts); /design registers fake ones.
 */
import type { LucideIcon } from "lucide-react";
import { createContext, useContext } from "react";

export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  /** Right-aligned, e.g. an amount or a date. */
  meta?: string;
  /** Where Enter goes. */
  href: string;
  icon?: LucideIcon;
};

export type SearchProvider = {
  id: string;
  /** Group heading in the palette, e.g. "Donors". */
  group: string;
  applies: (query: string) => boolean;
  search: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
};

export const isDigits = (query: string) => /^\d+$/.test(query.trim());
export const isEmailish = (query: string) => query.includes("@");
export const isVippsAgreementId = (query: string) => /^agr_/i.test(query.trim());

const SearchProvidersContext = createContext<SearchProvider[]>([]);
export const SearchProvidersProvider = SearchProvidersContext.Provider;
export const useSearchProviders = () => useContext(SearchProvidersContext);
