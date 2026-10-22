import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { sample, throwDice } from "@/lib/dice/physics";
import { rollDice } from "@/lib/dice/roll";
import { DIE_KINDS, shownDice } from "@/lib/dice/shown";
import { DICE_SKINS, skinForTheme } from "@/lib/dice/skins";
import { dieGeometry, faceLabel, restingFace, solidFor, symmetryBetween } from "@/lib/dice/solids";
import { THEMES } from "@/lib/theme";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("shownDice", () => {
  it("shows every rolled die with its face, and which ones counted", () => {
    const roll = rollDice("2d20kh1+1d6-3", sequence(4, 17, 6));
    expect(shownDice(roll.terms)).toEqual([
      { kind: 20, face: 4, kept: false },
      { kind: 20, face: 17, kept: true },
      { kind: 6, face: 6, kept: true },
    ]);
  });

  it("shows d10s as 0-9 and percentile as a tens die and a units die", () => {
    expect(shownDice(rollDice("1d10", sequence(10)).terms)).toEqual([{ kind: 10, face: 0, kept: true }]);
    expect(shownDice(rollDice("1d100", sequence(47)).terms)).toEqual([
      { kind: 100, face: 4, kept: true },
      { kind: 10, face: 7, kept: true },
    ]);
    expect(shownDice(rollDice("1d100", sequence(100)).terms)).toEqual([
      { kind: 100, face: 0, kept: true },
      { kind: 10, face: 0, kept: true },
    ]);
  });

  it("skips dice that have no solid and caps how many are thrown", () => {
    expect(shownDice(rollDice("1d3+1d7", sequence(2)).terms)).toEqual([]);
    expect(shownDice(rollDice("100d6", sequence(3)).terms)).toHaveLength(20);
  });
});

describe("solids", () => {
  it.each(DIE_KINDS)("d%s has one face per number, and any face can be turned to any other", (kind) => {
    const solid = solidFor(kind);
    const labels = solid.faces.map((face) => face.label).sort((a, b) => a - b);
    const expected = kind === 4 ? [1, 2, 3, 4] : kind === 10 || kind === 100 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : Array.from({ length: kind }, (_, i) => i + 1);
    expect(labels).toEqual(expected);

    for (const from of solid.faces) {
      for (const to of solid.faces) {
        const turned = from.normal.clone().applyQuaternion(symmetryBetween(solid, from, to));
        expect(turned.dot(to.normal)).toBeCloseTo(1, 5);
      }
    }
  });

  it.each(DIE_KINDS)("d%s is drawn closed, with every triangle facing out", (kind) => {
    const position = dieGeometry(solidFor(kind)).getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, i + k));
      const facing = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      expect(facing.dot(a.clone().add(b).add(c))).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it.each([6, 8, 10, 12, 20] as const)("opposite faces of a d%s add up like real dice", (kind) => {
    const solid = solidFor(kind);
    const total = kind === 10 ? 9 : kind + 1;
    for (const face of solid.faces) {
      const opposite = solid.faces.find((other) => other.normal.dot(face.normal) < -0.999)!;
      expect(face.label + opposite.label).toBe(total);
    }
  });

  it("reads a d4 from the face it rests on, and the rest from the top face", () => {
    const d6 = solidFor(6);
    const top = d6.faces.find((face) => face.normal.y > 0.99)!;
    expect(restingFace(d6, new Quaternion())).toBe(top);
    const d4 = solidFor(4);
    const turn = new Quaternion().setFromUnitVectors(d4.faces[0].normal, new Vector3(0, -1, 0));
    expect(restingFace(d4, turn)).toBe(d4.faces[0]);
  });

  it("labels percentile faces in tens", () => {
    expect([0, 4].map((face) => faceLabel(100, face))).toEqual(["00", "40"]);
    expect(faceLabel(10, 0)).toBe("0");
    expect(faceLabel(20, 20)).toBe("20");
  });
});

describe("throwDice", () => {
  const arena = { minX: -6, maxX: 6, minZ: -4, maxZ: 4 };

  it("lands every die, inside the table, on the face that was rolled", () => {
    const dice = [
      { kind: 20 as const, face: 17 },
      { kind: 6 as const, face: 2 },
      { kind: 4 as const, face: 3 },
      { kind: 10 as const, face: 0 },
      { kind: 100 as const, face: 9 },
      { kind: 12 as const, face: 11 },
      { kind: 8 as const, face: 5 },
    ];
    const tracks = throwDice(dice, arena, 1);
    tracks.forEach((track, i) => {
      const position = new Vector3();
      const rotation = new Quaternion();
      expect(sample(track, 999, position, rotation)).toBe(true);
      expect(position.x).toBeGreaterThan(arena.minX);
      expect(position.x).toBeLessThan(arena.maxX);
      expect(position.z).toBeGreaterThan(arena.minZ);
      expect(position.z).toBeLessThan(arena.maxZ);
      expect(position.y).toBeLessThan(2);
      const solid = solidFor(dice[i].kind);
      expect(restingFace(solid, rotation).label).toBe(dice[i].face);
    });
  });
});

describe("dice skins", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(THEMES.map((theme) => theme.id))("%s has its own dice, with numbers you can read", (id) => {
    const skin = skinForTheme(id);
    expect(skin).toBe(DICE_SKINS[id]);
    // Glowing ink lights itself, so it may sit closer to the body colour.
    expect(contrast(skin.ink, skin.base)).toBeGreaterThan(skin.inkGlow > 0.5 ? 2.5 : 3);
  });

  it("falls back to the default theme's dice", () => {
    expect(skinForTheme("nope")).toBe(DICE_SKINS.arcane);
  });
});
