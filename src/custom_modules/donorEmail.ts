/**
 * A donor's email is our de-facto identity key - the `email_UNIQUE` index on
 * Donors.email is what stops us from creating two donor rows for the same
 * person, and every create-or-get path keys off an exact match against it.
 *
 * That index used to normalize whitespace for us. The column was declared with
 * a PAD SPACE collation (utf8mb4_unicode_ci), under which "a@b.no " and
 * "a@b.no" compare equal, so a stray trailing space was harmless. Production
 * now reports utf8mb4_0900_ai_ci, and every MySQL 8 `_0900_` collation is
 * NO PAD - the two values are distinct. A lookup by the clean address misses
 * the stored row, and we mint a duplicate donor instead. Since the donor id is
 * baked into the Auth0 token claim on first login, the donor then signs in to
 * a brand new, empty donor and sees none of their donations.
 *
 * Trimming is safe: RFC 5322 treats whitespace surrounding an address as
 * folding whitespace that is not part of the addr-spec, so no two deliverable
 * mailboxes can differ only by leading or trailing whitespace. Interior spaces
 * in a quoted local part - `"a b"@example.com` - sit inside the quotes and are
 * left untouched.
 *
 * Deliberately NOT done here. Each of these merges genuinely distinct
 * mailboxes, which would hand one donor access to another donor's donation
 * history and tax units:
 *   - stripping dots in the local part (a Gmail convention, not a standard)
 *   - stripping +tags (subaddressing is not universally implemented)
 *   - unicode folding or homoglyph mapping
 *   - domain aliasing (googlemail.com -> gmail.com)
 *
 * Case is left alone too. The column collation is case-insensitive, so
 * comparisons already ignore case, and lowercasing on write would discard the
 * address as the donor typed it - which is the address we send receipts and
 * tax reports to. RFC 5321 section 2.4 reserves local-part case sensitivity to
 * the destination host, so we do not get to decide it is irrelevant.
 */
export const normalizeDonorEmail = (email: string | null | undefined) =>
  typeof email === "string" ? email.trim() : email;
