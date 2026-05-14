export type Platform = "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) {
    return "android";
  }
  return "desktop";
}

export const isAndroid = () => detectPlatform() === "android";
