import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Vec3, World } from "cannon-es";
import { Quaternion } from "three";
import type { DieKind } from "./shown";
import { restingFace, solidFor, symmetryBetween } from "./solids";

// The whole throw is simulated before anything is drawn, then played back.
// Physics picks where each die stops and which face ends up on top; the drawn
// die is then turned by one of its own symmetries so that face carries the
// number that was rolled. The motion is real; the result is the roll's.

export const STEP = 1 / 120;
/** Recorded frames per second of the throw. */
export const FPS = 60;
const MAX_SECONDS = 6;
const GRAVITY = -48;

/** The table the dice land on: y = 0, walled at these x and z. */
export type Arena = { minX: number; maxX: number; minZ: number; maxZ: number };
export type ThrowDie = { kind: DieKind; face: number };
/** `frames` holds x, y, z, qx, qy, qz, qw per recorded frame. `turn` is the symmetry to draw the die with. */
export type Track = { frames: Float32Array; count: number; turn: Quaternion; tilt: number };

const random = (min: number, max: number) => min + Math.random() * (max - min);

function hull(kind: DieKind, scale: number): ConvexPolyhedron {
  const solid = solidFor(kind);
  return new ConvexPolyhedron({
    vertices: solid.points.map((point) => new Vec3(point.x * scale, point.y * scale, point.z * scale)),
    faces: solid.faces.map((face) => [...face.indices]),
  });
}

function* simulate(dice: ThrowDie[], arena: Arena, scale: number) {
  const world = new World({ gravity: new Vec3(0, GRAVITY, 0), allowSleep: true });
  world.defaultContactMaterial.friction = 0.3;
  const table = new Material("table");
  const wall = new Material("wall");
  const die = new Material("die");
  world.addContactMaterial(new ContactMaterial(table, die, { friction: 0.46, restitution: 0.3 }));
  world.addContactMaterial(new ContactMaterial(wall, die, { friction: 0.1, restitution: 0.55 }));
  world.addContactMaterial(new ContactMaterial(die, die, { friction: 0.18, restitution: 0.4 }));

  const floor = new Body({ mass: 0, material: table, shape: new Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  // Plane normals point +z; each wall is turned to face into the arena.
  const walls: [Vec3, number, number, number][] = [
    [new Vec3(arena.minX, 0, 0), 0, Math.PI / 2, 0],
    [new Vec3(arena.maxX, 0, 0), 0, -Math.PI / 2, 0],
    [new Vec3(0, 0, arena.minZ), 0, 0, 0],
    [new Vec3(0, 0, arena.maxZ), 0, Math.PI, 0],
  ];
  // Thrown in from off screen past one edge (left, right or the bottom). That
  // edge's wall lets each die through once, then holds it: every die has its
  // own collision bit, added to the wall's mask as the die crosses it.
  const edge = Math.floor(Math.random() * 3);
  const gate = walls.map(([position, x, y, z]) => {
    const body = new Body({ mass: 0, material: wall, shape: new Plane(), position });
    body.quaternion.setFromEuler(x, y, z);
    world.addBody(body);
    return body;
  })[edge === 2 ? 3 : edge].shapes[0];
  gate.collisionFilterMask = 0;
  // A backstop behind the throw, so a die knocked backward still comes in.
  const behind = (6 + Math.ceil(dice.length / 2) * 2.3) * scale;
  const [stopAt, stopTurn] =
    edge === 0 ? [new Vec3(arena.minX - behind, 0, 0), Math.PI / 2]
    : edge === 1 ? [new Vec3(arena.maxX + behind, 0, 0), -Math.PI / 2]
    : [new Vec3(0, 0, arena.maxZ + behind), Math.PI];
  const backstop = new Body({ mass: 0, material: wall, shape: new Plane(), position: stopAt });
  backstop.quaternion.setFromEuler(0, stopTurn, 0);
  world.addBody(backstop);

  const center = new Vec3((arena.minX + arena.maxX) / 2, 0, (arena.minZ + arena.maxZ) / 2);
  const gap = 2.3 * scale;
  // As many dice side by side as the edge holds; the rest queue up behind.
  const length = edge === 2 ? arena.maxX - arena.minX : arena.maxZ - arena.minZ;
  const perRow = Math.max(1, Math.floor((length - 2 * scale) / gap));
  const bodies = dice.map(({ kind }, index) => {
    const lane = (index % perRow) - (Math.min(dice.length, perRow) - 1) / 2;
    const deep = Math.floor(index / perRow) * gap;
    const inset = -(1.6 * scale + deep);
    const position =
      edge === 0 ? new Vec3(arena.minX + inset, 0, center.z + lane * gap)
      : edge === 1 ? new Vec3(arena.maxX - inset, 0, center.z + lane * gap)
      : new Vec3(center.x + lane * gap, 0, arena.maxZ - inset);
    position.y = random(2.5, 4) * scale + deep * 0.3;
    const body = new Body({
      mass: 1,
      material: die,
      shape: Object.assign(hull(kind, scale), { collisionFilterGroup: 2 << index }),
      position,
      linearDamping: 0.15,
      angularDamping: 0.24,
      allowSleep: true,
      sleepSpeedLimit: 0.35,
      sleepTimeLimit: 0.15,
    });
    body.quaternion.setFromEuler(random(0, Math.PI * 2), random(0, Math.PI * 2), random(0, Math.PI * 2));
    const toward = center.vsub(position);
    toward.y = 0;
    toward.normalize();
    const speed = random(12, 17) * Math.sqrt(scale);
    body.velocity.set(toward.x * speed + random(-2, 2), random(-3, 1), toward.z * speed + random(-2, 2));
    body.angularVelocity.set(random(-18, 18), random(-18, 18), random(-18, 18));
    world.addBody(body);
    return body;
  });

  const limit = MAX_SECONDS * FPS;
  const perFrame = Math.round(1 / FPS / STEP);
  const frames = bodies.map(() => new Float32Array(limit * 7));
  let count = 0;
  const record = () => {
    bodies.forEach((body, i) => {
      frames[i].set([body.position.x, body.position.y, body.position.z, body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w], count * 7);
    });
    count += 1;
  };
  record();
  // How far a die is past the gate, into the table.
  const past = ({ position }: Body) => (edge === 0 ? position.x - arena.minX : edge === 1 ? arena.maxX - position.x : arena.maxZ - position.z);
  // Off the table the floor slopes toward it, so no die can come to rest out there.
  const inward = edge === 0 ? new Vec3(1, 0, 0) : edge === 1 ? new Vec3(-1, 0, 0) : new Vec3(0, 0, -1);
  const slope = inward.scale(-GRAVITY * 0.5);
  while (count < limit) {
    for (let k = 0; k < perFrame; k++) {
      bodies.forEach((body, index) => {
        if (gate.collisionFilterMask & (2 << index)) return;
        if (past(body) > 0) gate.collisionFilterMask |= 2 << index;
        else {
          if (body.sleepState === Body.SLEEPING) body.wakeUp();
          body.applyForce(slope);
        }
      });
      world.step(STEP);
    }
    record();
    if (count > FPS / 2 && bodies.every((body) => body.sleepState === Body.SLEEPING)) break;
    yield;
  }
  return { bodies, frames, count, allIn: bodies.every((body) => body.position.x > arena.minX && body.position.x < arena.maxX && body.position.z > arena.minZ && body.position.z < arena.maxZ) };
}

/** A die leaning more than this (cosine of the top face to straight up) reads badly. */
const LEANING = 0.95;

function* plan(dice: ThrowDie[], arena: Arena, scale: number): Generator<void, Track[]> {
  let best: { tracks: Track[]; worst: number } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { bodies, frames, count, allIn } = yield* simulate(dice, arena, scale);
    const tracks = dice.map(({ kind, face }, i) => {
      const solid = solidFor(kind);
      const q = bodies[i].quaternion;
      const rest = new Quaternion(q.x, q.y, q.z, q.w);
      const landed = restingFace(solid, rest);
      const wanted = solid.faces.find((item) => item.label === face);
      if (!wanted) throw new RangeError(`d${kind} has no face ${face}`);
      const tilt = Math.abs(landed.normal.clone().applyQuaternion(rest).y);
      return { frames: frames[i], count, turn: symmetryBetween(solid, wanted, landed), tilt };
    });
    // A die that never made it onto the table counts as the worst landing.
    const worst = allIn ? Math.min(...tracks.map((track) => track.tilt)) : 0;
    if (!best || worst > best.worst) best = { tracks, worst };
    if (worst > LEANING) break;
  }
  return best!.tracks;
}

/**
 * Simulates the throw and returns one recorded track per die. A die that ends
 * leaning hard on another or on a wall reads badly, so such throws are tried
 * again (as is the rare throw where a die never makes it onto the table).
 */
export function throwDice(dice: ThrowDie[], arena: Arena, scale: number): Track[] {
  const steps = plan(dice, arena, scale);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/**
 * The same, a few milliseconds at a time between frames, so a big throw on a
 * slow phone never freezes the page. Null when `stale` says a newer roll came.
 */
export async function throwDiceSoon(dice: ThrowDie[], arena: Arena, scale: number, stale: () => boolean): Promise<Track[] | null> {
  const steps = plan(dice, arena, scale);
  let until = performance.now() + 8;
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    if (performance.now() > until) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (stale()) return null;
      until = performance.now() + 8;
    }
  }
}

const a = new Quaternion();
const b = new Quaternion();

/** The die's place at `time` seconds into the throw, drawn with its symmetry turn. */
export function sample(track: Track, time: number, position: { set: (x: number, y: number, z: number) => unknown }, rotation: Quaternion): boolean {
  const at = Math.min(time * FPS, track.count - 1);
  const i = Math.floor(at);
  const j = Math.min(i + 1, track.count - 1);
  const t = at - i;
  const f = track.frames;
  position.set(f[i * 7] + (f[j * 7] - f[i * 7]) * t, f[i * 7 + 1] + (f[j * 7 + 1] - f[i * 7 + 1]) * t, f[i * 7 + 2] + (f[j * 7 + 2] - f[i * 7 + 2]) * t);
  a.set(f[i * 7 + 3], f[i * 7 + 4], f[i * 7 + 5], f[i * 7 + 6]);
  b.set(f[j * 7 + 3], f[j * 7 + 4], f[j * 7 + 5], f[j * 7 + 6]);
  rotation.slerpQuaternions(a, b, t).multiply(track.turn);
  return at >= track.count - 1;
}

export const duration = (track: Track) => (track.count - 1) / FPS;
