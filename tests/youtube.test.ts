import { describe, expect, it } from "vitest";
import { parseYouTubeLink, UNSAFE_TEXT, VIDEO_ID, videoIdFromTrack, watchUrl } from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeLink", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`https://WWW.YOUTUBE.COM/watch?v=${ID}`],
    [`  https://www.youtube.com/watch?v=${ID}  `],
    [`https://www.youtube.com/watch?v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?v=${ID}&list=PL123&index=4`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=tracking`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=share`],
    [`https://www.youtube.com/v/${ID}`],
  ])("reads the id from %s", (link) => {
    expect(parseYouTubeLink(link)).toBe(ID);
  });

  it.each([
    [""],
    ["   "],
    ["tavern music"],
    [ID],
    ["https://www.youtube.com/playlist?list=PLxyz"],
    [`https://www.youtube.com/watch?list=PLxyz`],
    [`https://www.youtube.com/watch?v=short`],
    [`https://www.youtube.com/watch?v=${ID}x`],
    [`https://www.youtube.com/watch?v=`],
    ["https://www.youtube.com/@somechannel"],
    ["https://www.youtube.com/"],
    [`https://evil.example/watch?v=${ID}`],
    [`https://www.youtube.com.evil.example/watch?v=${ID}`],
    [`https://evilyoutube.com/watch?v=${ID}`],
    [`https://notyoutu.be/${ID}`],
    [`https://user:pass@www.youtube.com/watch?v=${ID}`],
    [`https://user@youtu.be/${ID}`],
    [`https://www.youtube.com:8443/watch?v=${ID}`],
    [`https://www.youtube.com./watch?v=${ID}`],
    [`ftp://www.youtube.com/watch?v=${ID}`],
    [`javascript:alert(1)//www.youtube.com/watch?v=${ID}`],
    [`file:///etc/passwd`],
    [`data:text/html,<script>alert(1)</script>`],
    [`https://www.youtube.com/watch?v=${ID}%0a`],
    [`https://www.youtube.com/watch?v=..%2f..%2fetc`],
    [`https://www.youtube.com/shorts/`],
    [`https://www.youtube.com/channel/${ID}`],
    [`https://www.youtube.com/user/${ID}`],
    [`-o /etc/passwd`],
    [`https://youtu.be/`],
    [`https://www.youtube.com/watch?v=${"a".repeat(600)}`],
  ])("refuses %s", (input) => {
    expect(parseYouTubeLink(input)).toBeNull();
  });

  it("returns only an id that passes the strict pattern, whatever the link carried", () => {
    const evil = `https://www.youtube.com/watch?v=${ID}&x=${encodeURIComponent("--exec=rm -rf /")}`;
    const id = parseYouTubeLink(evil);
    expect(id).toBe(ID);
    expect(VIDEO_ID.test(id!)).toBe(true);
  });

  it("takes the first v when a link repeats it, and still validates it", () => {
    expect(parseYouTubeLink(`https://www.youtube.com/watch?v=${ID}&v=zzzzzzzzzzz`)).toBe(ID);
    expect(parseYouTubeLink(`https://www.youtube.com/watch?v=bad&v=${ID}`)).toBeNull();
  });
});

describe("videoIdFromTrack", () => {
  it("accepts what the bot returns: a watch link or a bare id", () => {
    expect(videoIdFromTrack(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(videoIdFromTrack(ID)).toBe(ID);
  });

  it("refuses anything else", () => {
    expect(videoIdFromTrack("music/track.ogg")).toBeNull();
    expect(videoIdFromTrack("yt-1-tavern-rain")).toBeNull();
  });
});

describe("watchUrl", () => {
  it("builds the one canonical link", () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it.each(["", "short", `${ID}x`, "https://youtu.be/x", `${ID}\n`, "a b c d e f g", "../../etc/pw"])("throws for %j", (value) => {
    expect(() => watchUrl(value)).toThrow();
  });
});

describe("UNSAFE_TEXT", () => {
  it.each(["a\nb", "a\u0000b", "a\u202Eb", "a\u200Bb", "a\u2066b", "a\uFEFFb", "a\u007fb", "a\tb"])("flags %j", (text) => {
    expect(UNSAFE_TEXT.test(text)).toBe(true);
  });

  it("lets ordinary titles through, accents and emoji included", () => {
    for (const title of ["Tavern Ambience", "Şarkı – Ejderha Savaşı", "Rain 🌧️ on the roof", "日本語のタイトル"]) {
      expect(UNSAFE_TEXT.test(title)).toBe(false);
    }
  });
});
