import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"],
      shadow: ["overlay", "panel"],
      radius: ["none", "xs", "sm", "md", "lg", "full"],
      spacing: ["row", "control", "cell"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
