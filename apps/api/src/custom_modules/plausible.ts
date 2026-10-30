interface TrackingData {
  revenue: string;
  method: string;
  recurring: boolean;
  kid: string;
}
/**
 * Helper function to encode tracking data into a base64 string for the plausible parameter
 */
export const encodePlausibleData = (data: TrackingData): string => {
  try {
    return Buffer.from(JSON.stringify(data)).toString("base64");
  } catch (error) {
    console.error("Failed to encode plausible tracking data:", error);
    return "";
  }
};
