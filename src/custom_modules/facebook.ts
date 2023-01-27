import { Donation, Fundraiser } from "../schemas/types";
import { createHash } from "crypto";
import luxon from "luxon";
import fetch from "node-fetch";
import config from "../config.js";

export const fetchToken = async () => {
  const response = await fetch(
    `https://graph.facebook.com/oauth/access_token?client_id=${config.facebook_sync_app_id}&client_secret=${config.facebook_sync_app_secret}&grant_type=client_credentials`
  );
  const res = await response.json();
  return res;
};

export const postExternalDonation = async (
  donation: Donation,
  fundraiser: Fundraiser
) => {
  const token = await fetchToken();

  const response = await fetch(
    `https://graph.facebook.com/${fundraiser.id}/external_donations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount_recieved: donation.sum,
        currency: "NOK",
        donation_id_hash: createHash("md5")
          .update(donation.id.toString())
          .digest("hex"),
        donor_id_hash: createHash("md5")
          .update(donation.donorId.toString())
          .digest("hex"),
        // Unix timestamp from ISO data using luxon
        donation_time: luxon.DateTime.fromISO(donation.timestamp).toSeconds(),
      }),
    }
  );

  const parsed = await response.json();
  if (!response.ok) {
    console.error(parsed);
    return false;
  } else {
    console.log("Graph object id ID", parsed.id);
    return true;
  }
};
