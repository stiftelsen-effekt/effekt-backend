import { nb, sv } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";
import noLogo from "@/assets/logos/GiEffektivt_Logo_Hvit_RGB.png";
import seLogo from "@/assets/logos/GeEffektivt_Logo_Hvit_RGB.png";
import { config, type Locale } from "./config";

export type LocaleSettings = {
  locale: Locale;
  orgName: string;
  intl: string;
  currency: "NOK" | "SEK";
  dateFns: DateFnsLocale;
  datePattern: string;
  logo: string;
};

export const localeSettings: Record<Locale, LocaleSettings> = {
  NO: {
    locale: "NO",
    orgName: "Gi Effektivt",
    intl: "nb-NO",
    currency: "NOK",
    dateFns: nb,
    datePattern: "dd.MM.yyyy",
    logo: noLogo,
  },
  SV: {
    locale: "SV",
    orgName: "Ge Effektivt",
    intl: "sv-SE",
    currency: "SEK",
    dateFns: sv,
    datePattern: "yyyy-MM-dd",
    logo: seLogo,
  },
};

export const appLocale = localeSettings[config.locale];
