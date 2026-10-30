// Make a date, in UTC. utcDate(2000, 1, 1) == new Date("2000-01-01T00:00:00Z")
export const utcDate = function (year: number, month: number, date: number) {
  return new Date(Date.UTC(year, month - 1, date));
};
