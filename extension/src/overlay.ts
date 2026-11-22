import { createDiceScene, type DiceLook, type DiceScene } from "@/components/dice/scene";
import type { ShownDie } from "@/lib/dice/shown";
import { skinForTheme } from "@/lib/dice/skins";
import { DEFAULT_THEME } from "@/lib/theme";

// The portal's 3D dice, thrown over the D&D Beyond page. The page keeps its own
// rolling; this only replays the numbers D&D Beyond already decided.

const LOOK: DiceLook = { skin: skinForTheme(DEFAULT_THEME), font: "Georgia, serif", crit: "#3ddc97", fumble: "#ff6b81", light: false };

let scene: DiceScene | null = null;
let queue: Promise<void> = Promise.resolve();

function sceneFor(): DiceScene {
  if (scene) return scene;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity .3s";
  document.documentElement.append(canvas);
  scene = createDiceScene(canvas);
  return scene;
}

/** Throws the dice one throw at a time; never rejects, so a missing WebGL cannot break the page. */
export function playRoll(dice: ShownDie[]): Promise<void> {
  if (dice.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return queue;
  queue = queue
    .then(() => sceneFor().play(dice, LOOK))
    .catch(() => undefined);
  return queue;
}
