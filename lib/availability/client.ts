"use client";

import { dmCall } from "@/lib/dm/client";

export type AvailabilityView = {
  today: string;
  days: string[];
  mine: string[];
  counts: Record<string, number>;
  total: number;
  players: string[];
  /** Names of the listed players who are free, per day. */
  who: Record<string, string[]>;
};

export type PlayersView = {
  candidates: { userId: string; displayName: string; avatarUrl: string | null }[];
  selected: string[];
  lastError: string | null;
};

export const AVAILABILITY_KEY = ["availability"] as const;

export const availabilityApi = {
  get: () => dmCall<AvailabilityView>("GET", "availability"),
  save: (days: string[]) => dmCall<{ saved: true }>("PUT", "availability", { days }),
  players: () => dmCall<PlayersView>("GET", "availability/players"),
  savePlayers: (userIds: string[]) => dmCall<{ saved: true }>("PUT", "availability/players", { userIds }),
  test: () => dmCall<{ sent: boolean; reason?: "not_configured" | "failed" }>("POST", "availability/test"),
};
