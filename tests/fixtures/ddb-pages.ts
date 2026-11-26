// Invented monsters in the markup D&D Beyond uses on its book pages. No book text here:
// these only copy the shapes the converter has to read.

type Row = [score: number, mod: string, save: string];
const ABILITIES = ["Str", "Dex", "Con", "Int", "Wis", "Cha"] as const;
const DEFAULT_ROWS: Row[] = [
  [10, "+0", "+0"],
  [14, "+2", "+2"],
  [12, "+1", "+1"],
  [8, "-1", "-1"],
  [10, "+0", "+0"],
  [9, "-1", "-1"],
];

const table = (kind: string, rows: Row[], start: number) =>
  `<div class="table-overflow-wrapper"><table class="${kind} abilities-saves"><thead><tr><th>Ability</th><th>Score</th><th>Mod</th><th>Save</th></tr></thead><tbody>` +
  rows.map((r, i) => `<tr><th>${ABILITIES[start + i]}</th><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("") +
  `</tbody></table></div>`;

export const section = (title: string) => `<p class="monster-header">${title}</p>`;
/** `<strong><em>Name.</em></strong> text` */
export const feature = (name: string, text: string) => `<p><strong><em>${name}.</em></strong> ${text}</p>`;
/** The period sits inside the bold but outside the italics. */
export const featurePeriodInBold = (name: string, text: string) => `<p><strong><em>${name}</em>.</strong> ${text}</p>`;
/** The period sits outside the bold. */
export const featurePeriodOutside = (name: string, text: string) => `<p><strong><em>${name}</em></strong>. ${text}</p>`;
/** The name is split over two bold runs. */
export const featureSplit = (first: string, second: string, text: string) => `<p><strong><em>${first}</em></strong> <strong><em>${second}.</em></strong> ${text}</p>`;
export const line = (label: string, text: string) => `<p><strong>${label}</strong> ${text}</p>`;
export const plain = (text: string) => `<p>${text}</p>`;

export type BlockOptions = {
  name?: string;
  /** Monster id for the heading link; null gives a plain-text heading with an anchor id. */
  id?: string | null;
  headingTag?: "h3" | "h4";
  firstLine?: string;
  ac?: string;
  hp?: string;
  speed?: string;
  rows?: Row[];
  /** Lines between the ability tables and the CR line (Skills, Immunities, Senses, Languages, Gear...). */
  lines?: string[];
  cr?: string;
  /** Everything after the CR line: section headers and features. */
  body?: string;
  /** Leave the ability tables out (a broken block). */
  noTables?: boolean;
};

export function statBlockHtml(o: BlockOptions = {}): string {
  const name = o.name ?? "Ember Drake";
  const tag = o.headingTag ?? "h4";
  const anchor = `${name.replace(/[^A-Za-z0-9]/g, "")}StatBlock`;
  const id = o.id === undefined ? "9000001" : o.id;
  const heading = id
    ? `<${tag} class="compendium-hr" id="${anchor}"><a href="#${anchor}" aria-hidden="true"></a><a class="tooltip-hover monster-tooltip" href="/monsters/${id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${name}</a></${tag}>`
    : `<${tag} class="compendium-hr" id="${anchor}"><a href="#${anchor}" aria-hidden="true"></a>${name}</${tag}>`;
  const rows = o.rows ?? DEFAULT_ROWS;
  const tables = o.noTables ? "" : `<div class="stats">${table("physical", rows.slice(0, 3), 0)}\n${table("mental", rows.slice(3), 3)}\n</div>`;
  return [
    `<div class="stat-block">`,
    heading,
    plain(o.firstLine ?? "Medium Dragon, Neutral"),
    line("AC", o.ac ?? "14 <strong>Initiative</strong> +2 (12)"),
    line("HP", o.hp ?? "27 (5d8 + 5)"),
    line("Speed", o.speed ?? "30 ft., Fly 60 ft."),
    tables,
    ...(o.lines ?? [line("Senses", "Darkvision 60 ft.; Passive Perception 10"), line("Languages", "Draconic")]),
    line("CR", o.cr ?? "2 (XP 450; PB +2)"),
    o.body ?? "",
    `</div>`,
  ].join("\n");
}

export const pageHtml = (blocks: string[], lore = "<h3>Lore</h3><p>Some surrounding prose.</p>") =>
  `<div class="p-article-content u-typography-format">\n${lore}\n${blocks.join("\n<h3>Next</h3>\n")}\n</div>`;
