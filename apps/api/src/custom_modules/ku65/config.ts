import type { Config } from "./ku65_lib";

export const KU65_CONFIG: Omit<Config, "reportingYear"> = {
  programName: "KUfilsprogrammet",
  orgNr: "802536-0739",
  orgName: "Ge Effektivt",
  avsandareContact: {
    name: "Sofie Sjöstrand",
    phone: "+46 760 22 83 74",
    email: "info@geeffektivt.se",
    address1: "Ge Effektivt c/o Mejsla Sveavägen 76, 3 tr",
    postNumber: "11359",
    postCity: "Stockholm",
  },
  uppgiftslamnareContact: {
    name: "Sofie Sjöstrand",
    phone: "+46 760 22 83 74",
    email: "info@geeffektivt.se",
    sakomrade: "Skatteverket",
  },
};
