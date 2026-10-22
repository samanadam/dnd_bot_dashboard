import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Ray,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { duration, sample, throwDiceSoon, type Arena, type Track } from "@/lib/dice/physics";
import type { DieKind, ShownDie } from "@/lib/dice/shown";
import type { DiceSkin } from "@/lib/dice/skins";
import { dieGeometry, solidFor } from "@/lib/dice/solids";
import { bodyTexture, dieMaps, haloTexture, type DieMaps } from "./textures";

// The 3D dice overlay. Loaded on demand so three.js and the physics stay out of
// the page bundles. Each throw is simulated first (lib/dice/physics), then
// played back here, so every die lands on the face the roll already chose.

/** How a throw looks: the theme's dice set, its font, and the crit colours. */
export type DiceLook = { skin: DiceSkin; font: string; crit: string; fumble: string; light: boolean };
/** `warm` paints the dice and compiles their shaders ahead of the first roll. */
export type DiceScene = { play: (dice: ShownDie[], look: DiceLook) => Promise<void>; warm: (look: DiceLook) => Promise<void>; dispose: () => void };

const HOLD_MS = 1500;
const FADE_MS = 350;

type Live = { mesh: Mesh; track: Track; dropped: MeshPhysicalMaterial[] | null; halo: Mesh | null };
type DieSet = { faces: MeshPhysicalMaterial; edges: MeshPhysicalMaterial };

const maps = new Map<string, DieMaps>();
const bodies = new Map<DiceSkin, Texture>();

function mapsFor(kind: DieKind, look: DiceLook): DieMaps {
  const key = `${kind}|${look.skin.name}|${look.font}`;
  let found = maps.get(key);
  if (!found) maps.set(key, (found = dieMaps(solidFor(kind), look.skin, look.font)));
  return found;
}

function bodyFor(skin: DiceSkin): Texture {
  let found = bodies.get(skin);
  if (!found) bodies.set(skin, (found = bodyTexture(skin)));
  return found;
}

function materialsFor(kind: DieKind, look: DiceLook): DieSet {
  const { skin } = look;
  const painted = mapsFor(kind, look);
  const shared = {
    roughness: skin.inkMetal ? 1 : skin.roughness,
    metalness: skin.inkMetal ? 1 : skin.metalness,
    clearcoat: skin.clearcoat,
    clearcoatRoughness: skin.clearcoatRoughness,
    iridescence: skin.iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 420] as [number, number],
    envMapIntensity: skin.reflections,
  };
  const faces = new MeshPhysicalMaterial({
    ...shared,
    map: painted.map,
    bumpMap: painted.bump,
    bumpScale: 2.2,
    ...(painted.metal ? { roughnessMap: painted.metal, metalnessMap: painted.metal } : {}),
    ...(painted.glow ? { emissive: new Color(0xffffff), emissiveMap: painted.glow, emissiveIntensity: skin.inkGlow } : {}),
  });
  const edges = new MeshPhysicalMaterial({ ...shared, roughness: skin.roughness, metalness: skin.metalness, map: bodyFor(skin) });
  return { faces, edges };
}

export function createDiceScene(canvas: HTMLCanvasElement): DiceScene {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const camera = new PerspectiveCamera(32, 1, 1, 80);
  camera.position.set(0, 20, 8);
  camera.lookAt(0, 0, 0);
  // The table is found by casting rays through the camera before anything is
  // drawn, and drawing is what would otherwise update this.
  camera.updateMatrixWorld();

  scene.add(new AmbientLight(0xffffff, 0.25));
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-5, 16, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.7);
  rim.position.set(7, 9, -6);
  scene.add(rim);

  const shadow = new ShadowMaterial({ opacity: 0.3 });
  const table = new Mesh(new PlaneGeometry(120, 120), shadow);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const halo = haloTexture();
  const haloShape = new PlaneGeometry(1, 1);
  const geometries = new Map<DieKind, BufferGeometry>();
  const sets = new Map<string, DieSet>();
  let live: Live[] = [];
  let frame = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let started = 0;
  let length = 0;
  let disposed = false;

  const fit = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (live.length && !frame) renderer.render(scene, camera);
  };
  window.addEventListener("resize", fit);

  /**
   * The table: over the page's main column (clear of the sidebar), as a
   * rectangle on the floor. The top keeps more room because dice there stand
   * toward the camera.
   */
  const arena = (): Arena => {
    const floor = new Plane(new Vector3(0, 1, 0), 0);
    const main = document.querySelector("main")?.getBoundingClientRect();
    const width = window.innerWidth;
    const usable = main && main.width > 360 ? main : { left: 0, right: width };
    const left = Math.max(-0.94, (usable.left / width) * 2 - 1 + 0.04);
    const right = Math.min(0.94, (usable.right / width) * 2 - 1 - 0.04);
    const corners = [
      [left, -0.86],
      [right, -0.86],
      [right, 0.7],
      [left, 0.7],
    ].map(([x, y]) => {
      const ray = new Ray(camera.position.clone(), new Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize());
      return ray.intersectPlane(floor, new Vector3()) ?? new Vector3();
    });
    const [bottomLeft, bottomRight, topRight, topLeft] = corners;
    return {
      minX: Math.max(bottomLeft.x, topLeft.x),
      maxX: Math.min(bottomRight.x, topRight.x),
      minZ: Math.max(topLeft.z, topRight.z),
      maxZ: Math.min(bottomLeft.z, bottomRight.z),
    };
  };

  const clear = () => {
    for (const die of live) {
      scene.remove(die.mesh);
      die.dropped?.forEach((material) => material.dispose());
      if (die.halo) {
        scene.remove(die.halo);
        (die.halo.material as MeshBasicMaterial).dispose();
      }
    }
    live = [];
  };

  const tick = (now: number) => {
    // The clock starts with the first frame actually drawn.
    started ||= now;
    const elapsed = (now - started) / 1000;
    for (const die of live) sample(die.track, elapsed, die.mesh.position, die.mesh.quaternion);

    const settled = (elapsed - length) * 1000;
    if (settled > 0) {
      for (const die of live) {
        die.dropped?.forEach((material) => (material.opacity = Math.max(0.28, 1 - settled / 300)));
        if (die.halo) {
          die.halo.position.set(die.mesh.position.x, 0.02, die.mesh.position.z);
          const material = die.halo.material as MeshBasicMaterial;
          material.opacity = Math.min(1, settled / 200) * (0.75 + 0.25 * Math.cos(settled / 180));
        }
      }
      if (settled > HOLD_MS) {
        canvas.style.opacity = "0";
        hideTimer = setTimeout(() => {
          clear();
          renderer.clear();
        }, FADE_MS);
        renderer.render(scene, camera);
        frame = 0;
        return;
      }
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };

  const geometryFor = (kind: DieKind) => {
    let geometry = geometries.get(kind);
    if (!geometry) geometries.set(kind, (geometry = dieGeometry(solidFor(kind))));
    return geometry;
  };

  const setFor = (kind: DieKind, look: DiceLook) => {
    const id = `${kind}|${look.skin.name}|${look.font}`;
    let set = sets.get(id);
    if (!set) sets.set(id, (set = materialsFor(kind, look)));
    return set;
  };

  let throwId = 0;

  const play = async (dice: ShownDie[], look: DiceLook) => {
    if (disposed || dice.length === 0) return;
    const id = ++throwId;
    fit();
    const bounds = arena();
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    if (!(width > 2 && depth > 2)) return;
    // Dice shrink on small screens and when many are thrown, never below a third.
    const scale = Math.max(0.34, Math.min(1, Math.min(width, depth) / 7.5, Math.sqrt((width * depth) / (dice.length * 16))));
    const tracks = await throwDiceSoon(dice, bounds, scale, () => disposed || id !== throwId);
    if (!tracks) return;

    cancelAnimationFrame(frame);
    clearTimeout(hideTimer);
    clear();
    shadow.opacity = look.light ? 0.22 : 0.42;
    // The natural 20 or 1 is the first d20 that counted, as in naturalD20.
    const natural = dice.find((die) => die.kind === 20 && die.kept);

    live = dice.map((die, index) => {
      const set = setFor(die.kind, look);
      const dropped = die.kept ? null : [set.faces.clone(), set.edges.clone()];
      dropped?.forEach((material) => (material.transparent = true));
      const mesh = new Mesh(geometryFor(die.kind), dropped ?? [set.faces, set.edges]);
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      scene.add(mesh);

      let glow: Mesh | null = null;
      if (die === natural && (die.face === 20 || die.face === 1)) {
        glow = new Mesh(haloShape, new MeshBasicMaterial({ map: halo, color: die.face === 20 ? look.crit : look.fumble, transparent: true, opacity: 0, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2;
        glow.scale.setScalar(4.2 * scale);
        scene.add(glow);
      }
      sample(tracks[index], 0, mesh.position, mesh.quaternion);
      return { mesh, track: tracks[index], dropped, halo: glow };
    });
    length = Math.max(...tracks.map(duration));

    // Shaders compile once per skin; on some GPUs that takes a moment.
    await renderer.compileAsync(scene, camera);
    if (disposed || id !== throwId) return;
    canvas.style.opacity = "1";
    started = 0;
    frame = requestAnimationFrame(tick);
  };

  const warm = async (look: DiceLook) => {
    if (disposed) return;
    const samples = ([20, 6] as const).map((kind) => {
      const set = setFor(kind, look);
      const mesh = new Mesh(geometryFor(kind), [set.faces, set.edges]);
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    });
    await renderer.compileAsync(scene, camera);
    samples.forEach((mesh) => scene.remove(mesh));
  };

  return {
    play,
    warm,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      window.removeEventListener("resize", fit);
      clear();
      geometries.forEach((geometry) => geometry.dispose());
      sets.forEach(({ faces, edges }) => {
        faces.dispose();
        edges.dispose();
      });
      maps.forEach((painted) => [painted.map, painted.bump, painted.glow, painted.metal].forEach((texture) => texture?.dispose()));
      bodies.forEach((texture) => texture.dispose());
      halo.dispose();
      haloShape.dispose();
      table.geometry.dispose();
      shadow.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
