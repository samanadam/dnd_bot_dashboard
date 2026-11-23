import "server-only";
import { z } from "zod";
import { UserRepo } from "@/lib/access/grants";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { botServer } from "@/lib/bot/server";
import { getDatabase } from "@/lib/dm/database";
import { env } from "@/lib/env";
import type { PartyDeps } from "./routes";
import { PartyNoteRepo } from "./store";

const channelsSchema = z.array(z.object({ id: z.string().regex(/^\d{17,20}$/), name: z.string().max(100), category: z.string().max(100).nullable() })).max(500);
const postedSchema = z.object({ message_id: z.string().regex(/^\d{17,20}$/) });

// Best effort and short: the note is already saved, so a slow bot must not hold the player up.
const TIMEOUT_MS = 4000;

export function partyDeps(): PartyDeps {
  return {
    getAccess,
    notes: () => new PartyNoteRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()),
    botToken: () => env().BOT_API_TOKEN,
    channels: async () => {
      const result = await botServer("GET", "guild/channels", { schema: channelsSchema });
      return result.ok ? result.data : null;
    },
    bot: {
      post: async (channelId, author, text) => {
        const result = await botServer("POST", "party-notes/post", { body: { channel_id: channelId, author, text }, schema: postedSchema, timeoutMs: TIMEOUT_MS });
        return result.ok ? result.data.message_id : null;
      },
      edit: (channelId, messageId, author, text) => botServer("POST", "party-notes/edit", { body: { channel_id: channelId, message_id: messageId, author, text }, timeoutMs: TIMEOUT_MS }),
      remove: (channelId, messageId) => botServer("POST", "party-notes/delete", { body: { channel_id: channelId, message_id: messageId }, timeoutMs: TIMEOUT_MS }),
    },
    log: audit,
  };
}
