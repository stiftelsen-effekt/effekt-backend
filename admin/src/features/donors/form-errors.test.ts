import { describe, expect, it } from "vitest";
import { isDuplicateEmail, plainMessage } from "./form-errors";

describe("plainMessage", () => {
  it("explains tax id validation in plain language", () => {
    expect(
      plainMessage("Invalid ssn (failed fnr validation) checksums don't match, invalid date"),
    ).toMatch(/^That isn't a valid fødselsnummer/);
    expect(plainMessage("Invalid organization number (failed checksum)")).toMatch(
      /^That isn't a valid organization number/,
    );
    expect(
      plainMessage("Invalid ssn (expected 11 digit fødselsnummer or 9 digit organization number)"),
    ).toMatch(/^Enter an 11-digit fødselsnummer/);
  });

  it("recognises a taken email and keeps other messages as written", () => {
    const message = plainMessage("Email already exists");
    expect(message).toBe("A donor with this email already exists.");
    expect(isDuplicateEmail(message)).toBe(true);
    expect(plainMessage("Name is too long")).toBe("Name is too long");
  });
});
