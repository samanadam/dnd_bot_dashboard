import { BoxGeometry, BufferGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, OctahedronGeometry, Quaternion, TetrahedronGeometry, Vector3 } from "three";
import type { DieKind } from "./shown";

// The shape of each die and which number sits on which face. Pure geometry, so
// it runs (and is tested) without WebGL. Faces are numbered like real dice:
// opposite faces add up to sides + 1 (a d10's 0-9 add up to 9). A d4 reads the
// corner on top, so its face `label` is the number of the corner it hides.

/** `indices` point into `Solid.points`, counter-clockwise seen from outside. */
export type Face = { normal: Vector3; center: Vector3; vertices: Vector3[]; indices: number[]; up: Vector3; label: number };
/** `corners` are a d4's corner numbers; `faceRadius` is the widest face, shared by every texture cell. */
export type Solid = { kind: DieKind; points: Vector3[]; faces: Face[]; corners: { at: Vector3; label: number }[]; radius: number; faceRadius: number };

const RADIUS: Record<DieKind, number> = { 4: 1.3, 6: 0.95, 8: 1.05, 10: 1.05, 12: 1.05, 20: 1.1, 100: 1.05 };
const SAME = 1e-4;

type Polygon = { normal: Vector3; vertices: Vector3[] };

/** Merges the triangles three.js builds into the die's real (flat) faces. */
function polygonsOf(geometry: BufferGeometry): Polygon[] {
  const position = (geometry.index ? geometry.toNonIndexed() : geometry).getAttribute("position");
  const polygons: Polygon[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, i + k));
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    if (normal.dot(a) < 0) normal.negate();
    let polygon = polygons.find((item) => item.normal.dot(normal) > 0.999);
    if (!polygon) polygons.push((polygon = { normal, vertices: [] }));
    for (const point of [a, b, c]) if (!polygon.vertices.some((vertex) => vertex.distanceTo(point) < SAME)) polygon.vertices.push(point);
  }
  return polygons;
}

/** A pentagonal trapezohedron: ten kites, five meeting at each pole. */
function d10Polygons(): Polygon[] {
  const ring = 0.11;
  // The pole height that keeps each kite flat.
  const pole = (ring * (1 + Math.cos(Math.PI / 5))) / (1 - Math.cos(Math.PI / 5));
  const at = (step: number, y: number) => new Vector3(Math.cos((step * Math.PI) / 5), y, Math.sin((step * Math.PI) / 5));
  const upper = (i: number) => at(2 * i, ring);
  const lower = (i: number) => at(2 * i + 1, -ring);
  const polygons: Polygon[] = [];
  for (let i = 0; i < 5; i++) {
    polygons.push({ normal: new Vector3(), vertices: [new Vector3(0, pole, 0), upper(i), lower(i), upper(i + 1)] });
    polygons.push({ normal: new Vector3(), vertices: [new Vector3(0, -pole, 0), lower(i), upper(i + 1), lower(i + 1)] });
  }
  for (const polygon of polygons) {
    const [a, b, c] = polygon.vertices;
    polygon.normal.subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    if (polygon.normal.dot(a) < 0) polygon.normal.negate();
  }
  return polygons;
}

function polygonsFor(kind: DieKind): Polygon[] {
  switch (kind) {
    case 4:
      return polygonsOf(new TetrahedronGeometry(1));
    case 6:
      return polygonsOf(new BoxGeometry(1, 1, 1));
    case 8:
      return polygonsOf(new OctahedronGeometry(1));
    case 12:
      return polygonsOf(new DodecahedronGeometry(1));
    case 20:
      return polygonsOf(new IcosahedronGeometry(1));
    default:
      return d10Polygons();
  }
}

function buildSolid(kind: DieKind): Solid {
  const polygons = polygonsFor(kind);
  const largest = Math.max(...polygons.flatMap((polygon) => polygon.vertices.map((vertex) => vertex.length())));
  const scale = RADIUS[kind] / largest;
  const points: Vector3[] = [];
  const indexOf = (point: Vector3) => {
    let index = points.findIndex((item) => item.distanceTo(point) < SAME);
    if (index < 0) index = points.push(point) - 1;
    return index;
  };

  const faces: Face[] = polygons.map(({ normal, vertices }) => {
    const scaled = vertices.map((vertex) => vertex.clone().multiplyScalar(scale));
    const center = scaled.reduce((sum, vertex) => sum.add(vertex), new Vector3()).divideScalar(scaled.length);
    // Numbers stand upright toward the face's farthest corner (a d10's pole).
    const far = Math.max(...scaled.map((vertex) => vertex.distanceTo(center)));
    const up = scaled.find((vertex) => vertex.distanceTo(center) > far - 1e-6)!.clone().sub(center).normalize();
    const side = new Vector3().crossVectors(normal, up);
    // Counter-clockwise seen from outside, so the triangles face out.
    const angle = (vertex: Vector3) => {
      const offset = vertex.clone().sub(center);
      return Math.atan2(offset.dot(side), offset.dot(up));
    };
    scaled.sort((a, b) => angle(a) - angle(b));
    const indices = scaled.map(indexOf);
    return { normal: normal.clone(), center, vertices: indices.map((index) => points[index]), indices, up, label: 0 };
  });

  const corners: Solid["corners"] = [];
  if (kind === 4) {
    points.forEach((at, index) => corners.push({ at, label: index + 1 }));
    for (const face of faces) face.label = corners.findIndex((_, index) => !face.indices.includes(index)) + 1;
  } else {
    const ten = kind === 10 || kind === 100;
    const total = ten ? 9 : kind + 1;
    const labelled = new Set<Face>();
    let next = ten ? 0 : 1;
    for (const face of faces) {
      if (labelled.has(face)) continue;
      const opposite = faces.find((other) => other.normal.dot(face.normal) < -0.999)!;
      face.label = next;
      opposite.label = total - next;
      labelled.add(face).add(opposite);
      next += 1;
    }
  }

  const faceRadius = Math.max(...faces.flatMap((face) => face.vertices.map((vertex) => vertex.distanceTo(face.center)))) * 1.04;
  return { kind, points, faces, corners, radius: RADIUS[kind], faceRadius };
}

const solids = new Map<DieKind, Solid>();

export function solidFor(kind: DieKind): Solid {
  let solid = solids.get(kind);
  if (!solid) solids.set(kind, (solid = buildSolid(kind)));
  return solid;
}

/** What is printed on a face: tens on a percentile die. */
export function faceLabel(kind: DieKind, label: number): string {
  if (kind === 100) return label === 0 ? "00" : `${label}0`;
  return String(label);
}

/** The face a resting die shows: the top face, or a d4's bottom face (it reads the corner above it). */
export function restingFace(solid: Solid, turn: Quaternion): Face {
  const sign = solid.kind === 4 ? -1 : 1;
  let best = solid.faces[0];
  let bestY = -Infinity;
  for (const face of solid.faces) {
    const y = sign * face.normal.clone().applyQuaternion(turn).y;
    if (y > bestY) [best, bestY] = [face, y];
  }
  return best;
}

const frame = (face: Face, corner: Vector3) => {
  const up = corner.clone().sub(face.center).normalize();
  return new Matrix4().makeBasis(up, face.normal, new Vector3().crossVectors(up, face.normal));
};

const symmetries = new Map<string, Quaternion>();

/**
 * A turn of the die onto itself that carries face `from` to where face `to`
 * is. Dice are symmetric, so a die that physics landed on `to` can be drawn
 * turned by this and land on `from` instead, with exactly the same motion.
 */
export function symmetryBetween(solid: Solid, from: Face, to: Face): Quaternion {
  const key = `${solid.kind}:${solid.faces.indexOf(from)}:${solid.faces.indexOf(to)}`;
  const known = symmetries.get(key);
  if (known) return known;
  const source = frame(from, from.vertices[0]).invert();
  for (const corner of to.vertices) {
    const matrix = frame(to, corner).multiply(source);
    const fits = solid.points.every((point) => {
      const moved = point.clone().applyMatrix4(matrix);
      return solid.points.some((other) => other.distanceTo(moved) < 1e-3);
    });
    if (fits) {
      const turn = new Quaternion().setFromRotationMatrix(matrix);
      symmetries.set(key, turn);
      return turn;
    }
  }
  throw new RangeError(`d${solid.kind}: no turn from face ${from.label} to ${to.label}`);
}

export function atlasGrid(cells: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(cells));
  return { cols, rows: Math.ceil(cells / cols) };
}

/**
 * The die as drawn: flat faces (group 0, mapped onto atlas cell `i` for face
 * `i`) and rounded edges and corners between them (group 1, mapped onto the
 * plain body texture). `bevel` is the edge width as a share of the die's radius.
 */
export function dieGeometry(solid: Solid, bevel = 0.07): BufferGeometry {
  const { cols, rows } = atlasGrid(solid.faces.length);
  const width = solid.radius * bevel;
  const faceData = { position: [] as number[], normal: [] as number[], uv: [] as number[] };
  const edgeData = { position: [] as number[], normal: [] as number[], uv: [] as number[] };

  // Each face shrinks inward by `width`; the gap it leaves becomes the edge.
  const inset = solid.faces.map((face) =>
    face.vertices.map((vertex, i) => {
      const prev = face.vertices[(i + face.vertices.length - 1) % face.vertices.length];
      const next = face.vertices[(i + 1) % face.vertices.length];
      const inA = new Vector3().crossVectors(face.normal, vertex.clone().sub(prev)).normalize();
      const inB = new Vector3().crossVectors(face.normal, next.clone().sub(vertex)).normalize();
      return vertex.clone().add(inA.add(inB).multiplyScalar(width / (1 + inA.dot(inB))));
    }),
  );

  // Edges and corners sample the body texture by position, seen from their side.
  const bodyUv = (point: Vector3, normal: Vector3) => {
    const a = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? [point.y, point.z] : Math.abs(normal.y) > Math.abs(normal.z) ? [point.x, point.z] : [point.x, point.y];
    return [0.5 + a[0] * 0.3, 0.5 + a[1] * 0.3];
  };

  const triangle = (data: typeof faceData, points: Vector3[], normals: Vector3[], uvs: number[][]) => {
    // Turn every triangle outward; the die is convex and centred on the origin.
    const facing = new Vector3().subVectors(points[1], points[0]).cross(new Vector3().subVectors(points[2], points[0]));
    const order = facing.dot(points[0].clone().add(points[1]).add(points[2])) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) {
      data.position.push(points[k].x, points[k].y, points[k].z);
      data.normal.push(normals[k].x, normals[k].y, normals[k].z);
      data.uv.push(uvs[k][0], uvs[k][1]);
    }
  };

  solid.faces.forEach((face, index) => {
    const side = new Vector3().crossVectors(face.up, face.normal);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const uv = (vertex: Vector3) => {
      const offset = vertex.clone().sub(face.center);
      return [(col + 0.5 + offset.dot(side) / (2 * solid.faceRadius)) / cols, 1 - (row + 0.5 - offset.dot(face.up) / (2 * solid.faceRadius)) / rows];
    };
    const points = inset[index];
    for (let k = 1; k < points.length - 1; k++) {
      const tri = [points[0], points[k], points[k + 1]];
      triangle(faceData, tri, [face.normal, face.normal, face.normal], tri.map(uv));
    }
  });

  // One strip per edge, its normals bending from one face to the other.
  solid.faces.forEach((face, f) => {
    face.indices.forEach((a, i) => {
      const b = face.indices[(i + 1) % face.indices.length];
      const g = solid.faces.findIndex((other, j) => j > f && other.indices.includes(a) && other.indices.includes(b));
      if (g < 0) return;
      const other = solid.faces[g];
      const fa = inset[f][i];
      const fb = inset[f][(i + 1) % face.indices.length];
      const ga = inset[g][other.indices.indexOf(a)];
      const gb = inset[g][other.indices.indexOf(b)];
      const n = [face.normal, face.normal, other.normal, other.normal];
      const quad = [fa, fb, gb, ga];
      const uvs = quad.map((point, k) => bodyUv(point, n[k]));
      triangle(edgeData, [quad[0], quad[1], quad[2]], [n[0], n[1], n[2]], [uvs[0], uvs[1], uvs[2]]);
      triangle(edgeData, [quad[0], quad[2], quad[3]], [n[0], n[2], n[3]], [uvs[0], uvs[2], uvs[3]]);
    });
  });

  // A small cap where the edges meet at each corner.
  solid.points.forEach((point, p) => {
    const around = solid.faces.flatMap((face, f) => (face.indices.includes(p) ? [{ at: inset[f][face.indices.indexOf(p)], normal: face.normal }] : []));
    const axis = point.clone().normalize();
    const ref = around[0].at.clone().sub(point).projectOnPlane(axis).normalize();
    const cross = new Vector3().crossVectors(axis, ref);
    const angle = ({ at }: { at: Vector3 }) => {
      const offset = at.clone().sub(point).projectOnPlane(axis);
      return Math.atan2(offset.dot(cross), offset.dot(ref));
    };
    around.sort((x, y) => angle(x) - angle(y));
    const center = around.reduce((sum, item) => sum.add(item.at), new Vector3()).divideScalar(around.length);
    for (let k = 0; k < around.length; k++) {
      const x = around[k];
      const y = around[(k + 1) % around.length];
      const tri = [center, x.at, y.at];
      const normals = [axis, x.normal, y.normal];
      triangle(edgeData, tri, normals, tri.map((item, j) => bodyUv(item, normals[j])));
    }
  });

  const geometry = new BufferGeometry();
  const join = (key: keyof typeof faceData) => [...faceData[key], ...edgeData[key]];
  geometry.setAttribute("position", new Float32BufferAttribute(join("position"), 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(join("normal"), 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(join("uv"), 2));
  const faceCount = faceData.position.length / 3;
  geometry.addGroup(0, faceCount, 0);
  geometry.addGroup(faceCount, edgeData.position.length / 3, 1);
  return geometry;
}
