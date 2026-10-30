import fetch from "node-fetch";
import * as config from "../config";

export type DonationConfirmedPayload = {
  donationId: number;
  amount: number;
  timestamp: string;
};

export function enqueueTidbytDonationConfirmed(payload: DonationConfirmedPayload) {
  if (!config.tidbyt_push_enabled) return;
  if (!config.tidbyt_worker_url) return;

  const url = `${config.tidbyt_worker_url.replace(/\/+$/, "")}/donations/confirmed`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  timeout.unref?.();

  // Fire-and-forget: do not block donation insertion on this side-effect.
  fetch(url, {
    method: "POST",
    signal: controller.signal as any,
    headers: {
      "Content-Type": "application/json",
      ...(config.tidbyt_worker_auth_token
        ? { Authorization: `Bearer ${config.tidbyt_worker_auth_token}` }
        : {}),
    },
    body: JSON.stringify(payload),
  })
    .catch(() => {
      // best-effort: ignore failures
    })
    .finally(() => clearTimeout(timeout));
}
