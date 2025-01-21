export interface ParsedSSN {
  fullYear: number;
  month: string;
  day: string;
  serialNumber: string;
  isValid: boolean;
  formatted: string; // YYYYMMDDNNNN format
  isBusiness: boolean;
}

export function parseSwedishSSN(ssn: string, currentYear: number): ParsedSSN {
  // Remove any whitespace
  ssn = ssn.trim();

  // Basic format check using regex - supports both with and without separator
  const ssnRegexWithSeparator = /^(\d{2}|\d{4})(\d{2})(\d{2})[+-](\d{4})$/;
  const ssnRegexWithoutSeparator = /^(\d{2}|\d{4})(\d{2})(\d{2})(\d{4})$/;

  let match = ssn.match(ssnRegexWithSeparator);
  const hasSeparator = match !== null;

  if (!match) {
    match = ssn.match(ssnRegexWithoutSeparator);
    if (!match) {
      return createInvalidResult();
    }
  }

  const [, yearPart, month, day, serialNumber] = match;
  // For SSNs without separator, we'll determine if they're over 100 based on the year only
  const separator = hasSeparator ? ssn.charAt(ssn.length - 5) : "-";

  const monthNum = parseInt(month);
  const isBusiness = monthNum >= 20;

  console.log(isBusiness, monthNum);

  // Validate month and day
  if (!isBusiness && (monthNum < 1 || monthNum > 12 || parseInt(day) < 1 || parseInt(day) > 31)) {
    return createInvalidResult();
  }

  let fullYear: number;

  // For business numbers, always use 16 as prefix
  if (isBusiness) {
    if (yearPart.length === 4) {
      fullYear = parseInt(`16${yearPart.substring(2)}`);
    } else {
      fullYear = parseInt(`16${yearPart}`);
    }
  } else if (yearPart.length === 2) {
    // Handle 2-digit years for personal numbers
    const currentCentury = Math.floor(currentYear / 100) * 100;
    const twoDigitYear = parseInt(yearPart);
    const possibleYear = currentCentury + twoDigitYear;

    if (separator === "+") {
      fullYear = possibleYear - 100;
    } else {
      // If the calculated year is in the future, go back one century
      fullYear = possibleYear > currentYear ? possibleYear - 100 : possibleYear;
    }
  } else {
    // 4-digit years
    fullYear = parseInt(yearPart);
    // Validate that + is only used for people over 100 years old
    if (separator === "+" && currentYear - fullYear < 100) {
      return createInvalidResult();
    }
    // Validate that - is only used for people under 100 years old
    if (separator === "-" && currentYear - fullYear >= 100) {
      return createInvalidResult();
    }
  }

  return {
    fullYear,
    month,
    day,
    serialNumber,
    isValid: true,
    formatted: `${fullYear}${month}${day}${serialNumber}`,
    isBusiness,
  };
}

function createInvalidResult(): ParsedSSN {
  return {
    fullYear: 0,
    month: "",
    day: "",
    serialNumber: "",
    isValid: false,
    formatted: "",
    isBusiness: false,
  };
}
