import { RequestHandler, Request } from "express";

export enum RequestLocale {
  NO = "NO",
  SE = "SE",
}

export interface LocaleRequest extends Request {
  locale: RequestLocale;
}

export const localeMiddleware: RequestHandler = (req: LocaleRequest, res, next) => {
  const taxLocale = req.query.locale as string | undefined;

  let locale: RequestLocale | undefined;
  if (taxLocale) {
    if (!Object.values(RequestLocale).includes(taxLocale as RequestLocale)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid locale",
      });
    } else {
      locale = taxLocale as RequestLocale;
    }
  } else {
    locale = RequestLocale.NO;
  }

  req.locale = locale;

  next();
};
