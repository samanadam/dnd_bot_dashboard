// Deny by default: an empty list means nobody is the DM.
export function isDm(userId: string | null | undefined, dmIds: readonly string[]): boolean {
  return typeof userId === "string" && userId.length > 0 && dmIds.includes(userId);
}
