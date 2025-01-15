function getEasterSunday(year: number) {
  // https://sv.wikipedia.org/wiki/P%C3%A5sk#Datum_f%C3%B6r_p%C3%A5skdagen
  // https://en.wikipedia.org/wiki/Computus#Anonymous_Gregorian_algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = Math.floor((h + l - 7 * m + 114) / 31);
  const p = (h + l - 7 * m + 114) % 31;
  const day = p + 1;
  const month = n;
  return new Date(year, month - 1, day);
}

function getMidsummerEve(year: number) {
  const midsummerEve = new Date(year, 5, 25);
  while (midsummerEve.getDay() !== 5) {
    midsummerEve.setDate(midsummerEve.getDate() - 1);
  }
  return midsummerEve;
}

function getAllSaintsEve(year: number) {
  const allSaintsEve = new Date(year, 10, 4);
  while (allSaintsEve.getDay() !== 5) {
    allSaintsEve.setDate(allSaintsEve.getDate() - 1);
  }
  return allSaintsEve;
}

function isSameDate(a: Date, b: Date) {
  const isSameYear = a.getFullYear() === b.getFullYear();
  const isSameMonth = a.getMonth() === b.getMonth();
  const isSameDay = a.getDate() === b.getDate();
  return isSameYear && isSameMonth && isSameDay;
}

/**
 * @see https://sv.wikipedia.org/wiki/Helgdagar_i_Sverige
 */
export const isSwedishWorkingDay = function (date: Date) {
  // Check if date is a weekend
  if (date.getDay() === 0 || date.getDay() === 6) return false;

  // Check if date is a holiday
  // 1. New years day
  if (date.getMonth() === 0 && date.getDate() === 1) return false;

  // 2. Epiphany
  if (date.getMonth() === 0 && date.getDate() === 6) return false;

  // 3. Maundy Thursday
  const easterSunday = getEasterSunday(date.getFullYear());
  const maundyThursday = new Date(easterSunday);
  maundyThursday.setDate(maundyThursday.getDate() - 3);
  if (isSameDate(date, maundyThursday)) return false;

  // 4. Good Friday
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);
  if (isSameDate(date, goodFriday)) return false;

  // 5. Easter Saturday
  const easterSaturday = new Date(easterSunday);
  easterSaturday.setDate(easterSaturday.getDate() - 1);
  if (isSameDate(date, easterSaturday)) return false;

  // 6. Easter Sunday
  if (isSameDate(date, easterSunday)) return false;

  // 7. Easter Monday
  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);
  if (isSameDate(date, easterMonday)) return false;

  // 9. May Day
  if (date.getMonth() === 4 && date.getDate() === 1) return false;

  // 10. Ascension Day
  const ascensionDay = new Date(easterSunday);
  ascensionDay.setDate(ascensionDay.getDate() + 39);
  if (isSameDate(date, ascensionDay)) return false;

  // 11. Pentecost Eve
  const pentecostEve = new Date(easterSunday);
  pentecostEve.setDate(pentecostEve.getDate() + 48);
  if (isSameDate(date, pentecostEve)) return false;

  // 12. Pentecost
  const pentecost = new Date(easterSunday);
  pentecost.setDate(pentecost.getDate() + 49);
  if (isSameDate(date, pentecost)) return false;

  // 13. National Day
  if (date.getMonth() === 5 && date.getDate() === 6) return false;

  // 14. Midsummer Eve
  const midsummerEve = getMidsummerEve(date.getFullYear());
  if (isSameDate(date, midsummerEve)) return false;

  // 15. Midsummer Day
  const midsummerDay = new Date(midsummerEve);
  midsummerDay.setDate(midsummerDay.getDate() + 1);
  if (isSameDate(date, midsummerDay)) return false;

  // 16. All Saints Eve
  const allSaintsEve = getAllSaintsEve(date.getFullYear());
  if (isSameDate(date, allSaintsEve)) return false;

  // 17. All Saints Day
  const allSaintsDay = new Date(allSaintsEve);
  allSaintsDay.setDate(allSaintsDay.getDate() + 1);
  if (isSameDate(date, allSaintsDay)) return false;

  // 18. Christmas Eve
  if (date.getMonth() === 11 && date.getDate() === 24) return false;

  // 19. Christmas Day
  if (date.getMonth() === 11 && date.getDate() === 25) return false;

  // 20. Boxing Day
  if (date.getMonth() === 11 && date.getDate() === 26) return false;

  // 21. New Years Eve
  if (date.getMonth() === 11 && date.getDate() === 31) return false;

  return true;
};
