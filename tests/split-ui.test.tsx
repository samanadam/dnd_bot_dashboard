import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveSession } from "@/lib/bot/types";

// The repo has no DOM test environment, so this renders the card to markup with
// the bot hooks replaced. Clicks and the 409 toast are covered by the proxy and
// contract tests and by the mock bot.
const state = vi.hoisted(() => ({ online: true, sessions: [] as unknown[] }));

vi.mock("@/lib/bot/useBotState", () => ({
  useBotOnline: () => ({ online: state.online }),
  useActiveRecordings: () => ({ isPending: false, isError: false, data: state.sessions, dataUpdatedAt: 0 }),
  useRecordingMutation: () => ({ mutate: () => undefined, isPending: false }),
}));
vi.mock("@/components/Providers", () => ({ useToast: () => () => undefined }));

import { ActiveRecordings } from "@/components/bot/ActiveRecordings";

const live = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  session_id: "2026-10-02-1830-ab12cd34",
  name: "Kamp (part 1)",
  channel_id: "123456789012345678",
  channel_name: "table",
  started_at: null,
  elapsed_seconds: 600,
  speakers: ["Aria"],
  speaker_count: 1,
  warnings: [],
  campaign_id: null,
  campaign_name: null,
  ...over,
});

const render = () => renderToStaticMarkup(<ActiveRecordings />);

describe("split button", () => {
  beforeEach(() => {
    state.online = true;
    state.sessions = [live()];
  });

  it("sits beside Stop & save on a live recording, and the dialog explains it", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*>.*Split<\/button>/);
    expect(html).toContain("Stop &amp; save");
    expect(html).toContain("Split this recording?");
    expect(html).toContain("with no gap");
    expect(html).toContain("Nobody needs to");
    expect(html).toContain("saved in the background");
    expect(html).toContain("cut in two");
  });

  it("is disabled while the bot is offline, like the other buttons", () => {
    state.online = false;
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Split<\/button>/);
  });

  it("offers one per live recording", () => {
    state.sessions = [live(), live({ session_id: "2026-10-02-1900-ffff0000", channel_id: "223456789012345678" })];
    // One per card, plus the dialog's confirm button.
    expect(render().match(/Split<\/button>/g)).toHaveLength(3);
  });

  it("suggests splitting only once a session has run three hours", () => {
    expect(render()).not.toContain("splitting keeps stops short");
    state.sessions = [live({ elapsed_seconds: 3 * 3600 })];
    expect(render()).toContain("Running for 3+ hours");
  });
});
