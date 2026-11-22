// Shape of lib/vault/auren.json, written by scripts/build-vault.mjs.

export type Inline =
  | string
  | { k: "b" | "i" | "c"; c: Inline[] }
  | { k: "l"; id: string; c: string }
  | { k: "a"; href: string; c: Inline[] }
  | { k: "img"; src: string; w?: number; alt: string };

export type ListItem = { c: Inline[]; done?: boolean; kids?: ListItem[] };

export type Block =
  | { t: "p" | "q"; c: Inline[] }
  | { t: "h"; l: number; c: Inline[] }
  | { t: "hr" }
  | { t: "code"; c: string }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] };

export type Note = {
  id: string;
  title: string;
  group: string;
  house?: string;
  tags: string[];
  thumb?: string;
  links: string[];
  blocks: Block[];
};

export type DmDoc = { id: string; title: string; blocks: Block[] };
export type VaultData = { hub: string; notes: Note[]; dm: DmDoc[] };
