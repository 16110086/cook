import { GetDefaults } from "../../wailsjs/go/main/App";

export interface Settings {
  downloadPath: string;
  authToken: string;
  timelineType: "media" | "timeline" | "tweets" | "with_replies";
  batchSize: number;
  theme: string;
  themeMode: "auto" | "light" | "dark";
}

export const DEFAULT_SETTINGS: Settings = {
  downloadPath: "",
  authToken: "",
  timelineType: "timeline",
  batchSize: 0,
  theme: "yellow",
  themeMode: "auto",
};

async function fetchDefaultPath(): Promise<string> {
  try {
    const data = await GetDefaults();
    return data.downloadPath || "";
  } catch (error) {
    console.error("Failed to fetch default path:", error);
    return "";
  }
}

const SETTINGS_KEY = "twitter-media-downloader-settings";

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
  return DEFAULT_SETTINGS;
}

export async function getSettingsWithDefaults(): Promise<Settings> {
  const settings = getSettings();
  
  // If downloadPath is empty, fetch from backend
  if (!settings.downloadPath) {
    settings.downloadPath = await fetchDefaultPath();
  }
  
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  saveSettings(updated);
  return updated;
}

export async function resetToDefaultSettings(): Promise<Settings> {
  const currentSettings = getSettings();
  const defaultPath = await fetchDefaultPath();
  const defaultSettings = { 
    ...DEFAULT_SETTINGS, 
    downloadPath: defaultPath,
    authToken: currentSettings.authToken, // Preserve auth token
  };
  saveSettings(defaultSettings);
  return defaultSettings;
}

export function applyThemeMode(mode: "auto" | "light" | "dark"): void {
  if (mode === "auto") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } else if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}
