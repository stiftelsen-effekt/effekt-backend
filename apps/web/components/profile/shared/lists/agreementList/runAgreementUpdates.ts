/** One change to an agreement; resolves to null (or false) when it failed */
export type AgreementUpdate = () => Promise<unknown>;

/**
 * Runs an agreement's changes one after another and stops at the first that fails, so the donor is
 * not told a partly failed save went through. True only when every change succeeded.
 */
export const runAgreementUpdates = async (updates: AgreementUpdate[]): Promise<boolean> => {
  for (const update of updates) {
    let result: unknown;
    try {
      result = await update();
    } catch (e) {
      console.error(e);
      return false;
    }
    if (result === null || result === undefined || result === false) return false;
  }
  return true;
};
