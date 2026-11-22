// The character vault lives under /vault: notes the player chose to publish, no
// session, database or bot behind it (see app/vault/layout.tsx).

/** True for /vault and anything below it, never for /vaulted or /vault-x. */
export function isVaultPath(pathname: string): boolean {
  return pathname === "/vault" || pathname.startsWith("/vault/");
}

export const imageUrl = (name: string, thumb = false) => `/vault/img/${name}${thumb ? ".thumb" : ""}.webp`;

export const GROUP_COLOR: Record<string, string> = {
  hub: "#f6e7b4",
  character: "#b7a6ff",
  backstory: "#6fd3f0",
  people: "#f4a95f",
  factions: "#ee6f8f",
  items: "#7fe3ad",
};

export const GROUP_LABEL: Record<string, string> = {
  hub: "Auren",
  character: "Character",
  backstory: "Backstory",
  people: "People",
  factions: "Factions",
  items: "Items",
};

export const HOUSE_COLOR: Record<string, string> = {
  Solvane: "#f3f1ff",
  Aethravel: "#f2c14e",
  Letharion: "#5fd38d",
  Caldrith: "#e5484d",
};
