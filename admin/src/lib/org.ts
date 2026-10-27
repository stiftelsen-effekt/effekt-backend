import logo from "@/assets/logos/GiEffektivt_Logo_Hvit_RGB.png";

/** The organisation this admin serves. */
export const org = {
  name: "Gi Effektivt",
  logo,
  /** Intrinsic size, so the logo's box is reserved before the image loads. */
  logoSize: { width: 1036, height: 153 },
} as const;
