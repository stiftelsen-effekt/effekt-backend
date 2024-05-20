import { DateTime } from "luxon";

type ExchangeRateResponse = {
  meta: {
    id: string;
    prepared: string;
    test: boolean;
    datasetId: string;
    sender: { id: string };
    receiver: { id: string };
    links: Array<{
      rel: string;
      href?: string;
      uri?: string;
      urn?: string;
    }>;
  };
  data: {
    dataSets: Array<{
      links: Array<{
        rel: string;
        urn: string;
      }>;
      reportingBegin: string;
      reportingEnd: string;
      action: string;
      series: {
        [key: string]: {
          attributes: number[];
          observations: {
            [key: string]: [string];
          };
        };
      };
    }>;
    structure: {
      links: Array<{
        rel: string;
        urn: string;
      }>;
      name: string;
      names: { no: string };
      description: string;
      descriptions: { no: string };
      dimensions: {
        dataset: any[];
        series: Array<{
          id: string;
          name: string;
          description: string;
          keyPosition?: number;
          role?: null | string;
          values: Array<{
            id: string;
            name: string;
            description: string;
            start?: string;
            end?: string;
          }>;
        }>;
        observation: Array<{
          id: string;
          name: string;
          description: string;
          keyPosition: number;
          role: "time";
          values: Array<{
            start: string;
            end: string;
            id: string;
            name: string;
          }>;
        }>;
      };
      attributes: {
        dataset: any[];
        series: Array<{
          id: string;
          name: string;
          description: string;
          relationship: {
            dimensions: string[];
          };
          role?: null | string;
          values: Array<{
            id: string;
            name: string;
          }>;
        }>;
        observation: any[];
      };
    };
  };
};

/**
 * Get exchange rates from Norges Bank from 2016 to today
 * @returns Exchange rates from Norges Bank
 */
export const getExchangeRates = async (): Promise<ExchangeRateResponse> => {
  const exchangeRatesResult = await fetch(
    `https://data.norges-bank.no/api/data/EXR/M.USD.NOK.SP?format=sdmx-json&startPeriod=2016-01-01&endPeriod=${
      new Date().toISOString().split("T")[0]
    }&locale=no`,
  );
  const exchangeRates = await exchangeRatesResult.json();
  return exchangeRates;
};

/**
 * Returns the best exchange rate for a given month from Norges Bank
 * @param exchangeRates Exchange rates from Norges Bank
 * @param date Date in format YYYY-MM
 * @returns Exchange rates from Norges Bank
 */
export const getBestExchangeRate = (exchangeRates: ExchangeRateResponse, date: string) => {
  // Observations begin at 2016-01-01
  // Key is period since 2016-01-01
  // I.e. 2016-01-01 is 0, 2016-01-02 is 1, etc.
  // Date is given as YYYY-MM
  const dateAsPeriod =
    (parseInt(date.split("-")[0]) - 2016) * 12 + parseInt(date.split("-")[1]) - 1;
  try {
    return parseFloat(
      exchangeRates.data.dataSets[0].series["0:0:0:0"].observations[dateAsPeriod][0],
    );
  } catch (ex) {
    // Take the last available exchange rate
    return parseFloat(
      exchangeRates.data.dataSets[0].series["0:0:0:0"].observations[
        exchangeRates.data.structure.dimensions.observation[0].values.length - 1
      ][0],
    );
  }
};

/**
 * Get the exchange rate for a given date
 * @param date Date in JS Date format
 * @returns Exchange rate for the given date
 */
export const getExchangeRateForDate = async (date: Date) => {
  const start = DateTime.fromJSDate(date).minus({ days: 31 });
  const end = DateTime.fromJSDate(date);

  const url = `https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP?format=sdmx-json&startPeriod=${
    start.toISODate().split("T")[0]
  }&endPeriod=${end.toISODate().split("T")[0]}&locale=no`;

  const exchangeRateResult = await fetch(url);

  const exchangeRate = await exchangeRateResult.json();

  // Pick last available exchange rate
  const closest =
    exchangeRate.data.dataSets[0].series["0:0:0:0"].observations[0][
      exchangeRate.data.dataSets[0].series["0:0:0:0"].observations[0].length - 1
    ];
  return closest;
};
