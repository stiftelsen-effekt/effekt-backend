import { DAO } from "./DAO";
import { DistributionInput } from "../schemas/types";

/** A distribution that names another donor, or a tax unit the donor doesn't own */
export class DistributionOwnershipError extends Error {
  status = 400;
  msg: string;

  constructor(message: string) {
    super(message);
    this.name = "DistributionOwnershipError";
    this.msg = message;
  }
}

/**
 * A new distribution for an existing agreement must stay with the agreement's donor, and its
 * tax unit (if any) must be one of that donor's active tax units. Throws DistributionOwnershipError
 * otherwise.
 */
export async function assertDistributionOwnedBy(
  ownerDonorId: number,
  distribution: Pick<DistributionInput, "donorId" | "taxUnitId">,
) {
  if (distribution.donorId !== ownerDonorId) {
    throw new DistributionOwnershipError("Distribution donor does not match the agreement's donor");
  }
  if (distribution.taxUnitId !== null && distribution.taxUnitId !== undefined) {
    const taxUnit = await DAO.tax.getById(distribution.taxUnitId);
    if (!taxUnit || taxUnit.donorId !== ownerDonorId || taxUnit.archived) {
      throw new DistributionOwnershipError("Tax unit does not belong to the agreement's donor");
    }
  }
}
