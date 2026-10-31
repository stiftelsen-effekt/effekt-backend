import fetch from "node-fetch";
import config from "../config.js";

export const fetchToken = async () => {
  const response = await fetch(
    `https://graph.facebook.com/oauth/access_token?client_id=${config.facebook_sync_app_id}&client_secret=${config.facebook_sync_app_secret}&grant_type=client_credentials`,
  );
  const res = await response.json();
  return res;
};
