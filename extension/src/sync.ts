// Reading a character from D&D Beyond and handing it on, without any browser API, so it is
// unit-tested in the portal's suite. The background script supplies the real pieces.

// `live` is the player's own Start/Stop: characters sync on their own only while it is on, and the
// portal shows the player as live. It is off after every browser start, so it is started on purpose.
// `autoStart` turns live sync on when the player opens one of their characters on D&D Beyond.
// `writeBack` lets HP changes made in the portal (damage, healing, temp HP, death saves) reach D&D Beyond.
// `rollsToDdb` shows the player's portal rolls in D&D Beyond's game log (through an open character page).
export type Settings = { live: boolean; autoStart: boolean; intervalSeconds: number; replayRolls: boolean; overlay: boolean; writeBack: boolean; rollsToDdb: boolean };
export const DEFAULT_SETTINGS: Settings = { live: false, autoStart: false, intervalSeconds: 30, replayRolls: true, overlay: true, writeBack: true, rollsToDdb: false };

/** The live sync interval in whole seconds: 30 s is the smallest alarm Chrome allows, and the portal calls a player offline after 150 s of silence. */
export function clampInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.intervalSeconds;
  return Math.min(60, Math.max(30, Math.trunc(value)));
}

export type PushMessage = { ddbCharacterId: string; capturedAt: string; readOnly: boolean; character: unknown };
export type SyncDeps = {
  getToken: () => Promise<string>;
  invalidateToken: () => void;
  fetchCharacter: (id: string, token: string) => Promise<{ status: number; json?: unknown }>;
  push: (message: PushMessage) => Promise<{ ok: boolean }>;
  // Records why a character could not be read (the portal's own answer is recorded by `push`).
  report: (id: string, error: string | null) => void;
  // A character the player cannot edit: another player's, seen through a shared campaign. Never pushed.
  notMine: (id: string, character: unknown) => void;
  now: () => number;
};
export type SyncResult = "ok" | "signin" | "error" | "busy" | "notmine";

const running = new Set<string>();

/** One character: fetch it from D&D Beyond (refreshing the token once if refused) and push it. */
export async function syncCharacter(deps: SyncDeps, id: string): Promise<SyncResult> {
  if (running.has(id)) return "busy";
  running.add(id);
  try {
    let answer: { status: number; json?: unknown } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await deps.getToken();
      } catch {
        deps.report(id, "Sign in to D&D Beyond in this browser.");
        return "signin";
      }
      try {
        answer = await deps.fetchCharacter(id, token);
      } catch {
        deps.report(id, "Cannot reach D&D Beyond.");
        return "error";
      }
      if (answer.status !== 401 && answer.status !== 403) break;
      deps.invalidateToken();
      if (attempt === 1) {
        deps.report(id, "D&D Beyond refused the request. Sign in again, then open the character.");
        return "signin";
      }
    }
    if (!answer) return "error";
    if (answer.status === 404) {
      deps.report(id, "Character not found on D&D Beyond (deleted or private).");
      return "error";
    }
    if (answer.status < 200 || answer.status >= 300) {
      deps.report(id, `D&D Beyond answered ${answer.status}.`);
      return "error";
    }
    const canEdit = (answer.json as { data?: { canEdit?: unknown } } | undefined)?.data?.canEdit === true;
    if (!canEdit) {
      deps.notMine(id, answer.json);
      return "notmine";
    }
    const pushed = await deps.push({ ddbCharacterId: id, capturedAt: new Date(deps.now()).toISOString(), readOnly: false, character: answer.json });
    return pushed.ok ? "ok" : "error";
  } finally {
    running.delete(id);
  }
}

/** Every character in turn; one that fails does not stop the others, and the token is fetched once. */
export async function syncAll(deps: SyncDeps, ids: string[]): Promise<Record<string, SyncResult>> {
  let token: Promise<string> | null = null;
  const shared: SyncDeps = {
    ...deps,
    getToken: () => (token ??= deps.getToken().catch((error) => {
      token = null;
      throw error;
    })),
    invalidateToken: () => {
      token = null;
      deps.invalidateToken();
    },
  };
  const result: Record<string, SyncResult> = {};
  for (const id of ids) result[id] = await syncCharacter(shared, id);
  return result;
}

export type HpWrite = { ddbCharacterId: string; hp: number; tempHp: number; removed: number; successes: number; failures: number };
export type WriteDeps = Pick<SyncDeps, "getToken" | "invalidateToken" | "report"> & {
  putCharacter: (path: string, body: unknown, token: string) => Promise<{ status: number }>;
};

/**
 * Two-way HP: saves an HP change made in the portal on D&D Beyond, with the calls D&D Beyond's own
 * page makes (damage taken and temp HP, then death saves). The token is refreshed once if refused.
 */
export async function applyWrite(deps: WriteDeps, write: HpWrite): Promise<SyncResult> {
  const characterId = Number(write.ddbCharacterId);
  const calls: Array<[string, unknown]> = [
    ["life/hp/damage-taken", { characterId, removedHitPoints: write.removed, temporaryHitPoints: write.tempHp }],
    ["life/death-saves", { characterId, successCount: write.successes, failCount: write.failures }],
  ];
  for (const [path, body] of calls) {
    let status = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      let token: string;
      try {
        token = await deps.getToken();
      } catch {
        deps.report(write.ddbCharacterId, "Sign in to D&D Beyond in this browser.");
        return "signin";
      }
      try {
        status = (await deps.putCharacter(path, body, token)).status;
      } catch {
        deps.report(write.ddbCharacterId, "Cannot reach D&D Beyond.");
        return "error";
      }
      if (status !== 401 && status !== 403) break;
      deps.invalidateToken();
    }
    if (status < 200 || status >= 300) {
      deps.report(write.ddbCharacterId, `D&D Beyond did not take the HP change from the portal (${status}).`);
      return status === 401 || status === 403 ? "signin" : "error";
    }
  }
  return "ok";
}
