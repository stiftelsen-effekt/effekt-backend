import type { TrpcClient } from "../lib/trpc/client";
import { PaymentMethod } from "../components/shared/components/Widget/types/Enums";

interface GetEstimatedLtvParams {
  method: PaymentMethod;
  sum: number;
  /**
   * The public client for this site (widgetTrpc() in the widget, publicTrpcFor(locale) elsewhere).
   * The Danish backend has no estimate, so there it is always null.
   */
  trpc: TrpcClient;
}

/**
 * A new recurring donor's predicted lifetime value (tRPC site.ltvEstimate), weighted by how their
 * sum compares to the median agreement. Null for other payment methods, or if there's no estimate.
 */
export async function getEstimatedLtv({
  method,
  sum,
  trpc,
}: GetEstimatedLtvParams): Promise<number | null> {
  // Only proceed for VIPPS or AVTALEGIRO
  if (method !== PaymentMethod.VIPPS && method !== PaymentMethod.AVTALEGIRO) {
    return null;
  }

  try {
    const estimates = await trpc.site.ltvEstimate.query();

    // Find the relevant estimate based on payment method
    const label = method === PaymentMethod.VIPPS ? "Vipps" : "AvtaleGiro";
    const estimate = estimates.find((e) => e.label === label);

    if (!estimate) {
      return null;
    }

    let ltv = estimate.expectedLtv;

    // Apply median weighting if both median and donation sum exist
    if (estimate.median) {
      ltv = estimate.expectedLtv * Math.sqrt(sum / estimate.median);
    }

    return ltv;
  } catch (error) {
    console.error("Error fetching LTV estimate:", error);
    return null;
  }
}
