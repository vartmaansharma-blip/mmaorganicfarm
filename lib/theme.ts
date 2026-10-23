export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "mama-theme";
const THEME_EVENT = "mama-theme-change";

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Private browsing still supports an in-page choice. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeToTheme(callback: () => void) {
  const syncTab = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const theme = event.newValue === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    callback();
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", syncTab);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", syncTab);
  };
}

export function getServerTheme(): Theme { return "dark"; }
