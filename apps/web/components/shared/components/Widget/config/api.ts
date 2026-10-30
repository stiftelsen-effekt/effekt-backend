let apiUrl;

if (process.env.NEXT_PUBLIC_EFFEKT_API) {
  apiUrl = process.env.NEXT_PUBLIC_EFFEKT_API;
} else {
  apiUrl = "http://localhost:5050";
}

export const API_URL = apiUrl;
export const WEBSOCKET_URL = apiUrl.replace(/^http/, "ws");
