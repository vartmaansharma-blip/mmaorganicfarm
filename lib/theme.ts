export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "mma-theme";
const THEME_EVENT = "mama-theme-change";

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Private browsing still supports an in-page choice. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeToTheme(callback: () => void) {
  const syncTab = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const theme = event.newValue === "dark" ? "dark" : "light";
    applyTheme(theme);
    callback();
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", syncTab);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", syncTab);
  };
}

export function getServerTheme(): Theme { return "light"; }
