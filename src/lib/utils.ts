import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 慣例 cn:合併 conditional class + tailwind 衝突消除
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
