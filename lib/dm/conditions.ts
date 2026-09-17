// The standard conditions, with a one-line reminder shown in the tracker.
export const CONDITIONS = [
  { name: "Blinded", hint: "Fails sight checks. Attacks against it have advantage; its attacks have disadvantage." },
  { name: "Charmed", hint: "Cannot attack the charmer. The charmer has advantage on social checks against it." },
  { name: "Deafened", hint: "Cannot hear; fails hearing checks." },
  { name: "Exhaustion", hint: "Penalty to d20 tests and speed, growing with each level." },
  { name: "Frightened", hint: "Disadvantage on checks and attacks while the source is in sight; cannot move closer." },
  { name: "Grappled", hint: "Speed 0. Disadvantage on attacks against anyone but the grappler." },
  { name: "Incapacitated", hint: "No actions, bonus actions or reactions; concentration breaks." },
  { name: "Invisible", hint: "Attacks against it have disadvantage; its attacks have advantage." },
  { name: "Paralyzed", hint: "Incapacitated, speed 0, fails Str and Dex saves. Nearby hits are critical." },
  { name: "Petrified", hint: "Turned to stone: incapacitated, resistant to all damage." },
  { name: "Poisoned", hint: "Disadvantage on attack rolls and ability checks." },
  { name: "Prone", hint: "Crawls. Nearby attacks against it have advantage, distant ones disadvantage." },
  { name: "Restrained", hint: "Speed 0. Its attacks and Dex saves have disadvantage; attacks against it have advantage." },
  { name: "Stunned", hint: "Incapacitated, fails Str and Dex saves. Attacks against it have advantage." },
  { name: "Unconscious", hint: "Incapacitated and prone, drops what it holds. Nearby hits are critical." },
] as const;

export type ConditionName = (typeof CONDITIONS)[number]["name"];

export function conditionHint(name: string): string | undefined {
  return CONDITIONS.find((condition) => condition.name === name)?.hint;
}
