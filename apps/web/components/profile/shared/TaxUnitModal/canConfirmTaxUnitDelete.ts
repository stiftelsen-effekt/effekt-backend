/** Deleting a tax unit can be confirmed unless moving its donations was chosen without a target */
export const canConfirmTaxUnitDelete = (
  transferDonations: boolean,
  transferUnit: { id: number } | null,
): boolean => !transferDonations || transferUnit !== null;
