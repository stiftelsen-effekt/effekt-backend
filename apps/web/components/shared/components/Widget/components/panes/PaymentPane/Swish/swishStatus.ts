const FINAL_SWISH_STATUSES = ["PAID", "DECLINED", "ERROR", "CANCELLED"];

/** Poll the Swish order every second until it reaches a final status, then stop */
export const swishStatusRefreshInterval = (data?: { status?: string | null } | null) =>
  data?.status && FINAL_SWISH_STATUSES.includes(data.status) ? 0 : 1000;
