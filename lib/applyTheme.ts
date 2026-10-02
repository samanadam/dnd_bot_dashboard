import { preferenceCookieLifetime } from "@/lib/consent";
import { THEME_COOKIE, themeVars, type ThemeId } from "@/lib/theme";

/** Repaints the page in a theme right now and remembers it (see lib/consent.ts for how long). */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(id))) {
    if (key === "colorScheme") root.style.colorScheme = value;
    else root.style.setProperty(key, value);
  }
  root.dataset.theme = id;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // Plain preference cookie, not sensitive. The server re-validates the id.
  document.cookie = `${THEME_COOKIE}=${id}; Path=/${preferenceCookieLifetime()}; SameSite=Lax${secure}`;
}
