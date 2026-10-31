/** The currency donations are made in on the site with this widget locale (Sanity main_locale) */
export const currencyForLocale = (locale: string | null | undefined): string => {
  switch (locale) {
    case "sv":
      return "SEK";
    case "dk":
      return "DKK";
    case "et":
      return "EUR";
    default:
      return "NOK";
  }
};
