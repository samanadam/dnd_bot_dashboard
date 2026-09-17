export type Rng = (sides: number) => number;

// Uniform integer in 1..sides from the platform CSPRNG (browser and Node).
// Rejection sampling: `value % sides` on its own would favour low numbers.
export const secureRng: Rng = (sides) => {
  if (!Number.isInteger(sides) || sides < 1 || sides > 0xffff_ffff) throw new RangeError("invalid die");
  const limit = Math.floor(0x1_0000_0000 / sides) * sides;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return (buffer[0] % sides) + 1;
  }
};
