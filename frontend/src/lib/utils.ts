import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizePath(input: string, os: string): string {
  if (os === "Windows") {
    return input.replace(/[<>:"/\\|?*]/g, "_");
  }
  return input.replace(/\//g, "_");
}

export function joinPath(os: string, ...parts: string[]): string {
  const sep = os === "Windows" ? "\\" : "/";
  
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return "";
  
  const joined = filtered
    .map((p, i) => {
      if (i === 0) {
        return p.replace(/[/\\]+$/g, "");
      }
      return p.replace(/^[/\\]+|[/\\]+$/g, "");
    })
    .filter(Boolean)
    .join(sep);
  
  return joined;
}
