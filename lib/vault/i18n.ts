export type Lang = "en" | "tr";

export const PATH: Record<Lang, string> = { en: "/vault/auren", tr: "/vault/auren/tr" };

export const T = {
  en: {
    eyebrow: "Character vault",
    find: "Find a note",
    dm: "DM summary",
    dmClose: "Close DM summary",
    close: "Close note",
    linksTo: "Links to",
    mentionedIn: "Mentioned in",
    linked: "Linked notes",
    backlinks: "Backlinks",
    house: (h: string) => `House ${h}`,
    hint: "Drag to move · scroll or pinch to zoom · tap a note to read it",
    enlarge: (alt: string) => `Enlarge ${alt}`,
    switchTo: "Türkçe",
    groups: { hub: "Auren", character: "Character", backstory: "Backstory", people: "People", factions: "Factions", items: "Items" } as Record<string, string>,
    canvas: "Graph of linked notes. Use the search box to open a note by keyboard, or click a node.",
  },
  tr: {
    eyebrow: "Karakter defteri",
    find: "Not ara",
    dm: "DM özeti",
    dmClose: "DM özetini kapat",
    close: "Notu kapat",
    linksTo: "Bağlantılar",
    mentionedIn: "Şurada geçiyor",
    linked: "Bağlı notlar",
    backlinks: "Geri bağlantılar",
    house: (h: string) => `${h} Hanesi`,
    hint: "Sürükleyerek taşı · kaydırarak ya da sıkıştırarak yakınlaştır · okumak için bir nota dokun",
    enlarge: (alt: string) => `${alt} görselini büyüt`,
    switchTo: "English",
    groups: { hub: "Auren", character: "Karakter", backstory: "Geçmiş", people: "Kişiler", factions: "Gruplar", items: "Eşyalar" } as Record<string, string>,
    canvas: "Bağlı notların grafiği. Klavyeyle not açmak için arama kutusunu kullanın ya da bir düğüme tıklayın.",
  },
} as const;
