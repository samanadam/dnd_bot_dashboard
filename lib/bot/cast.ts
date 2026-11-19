import { bot } from "./client";

// Browser side of a live cast: capture a tab's audio, record it as webm/opus and
// stream the chunks to the bot's socket (Caddy forwards /cast/ws to it). The
// socket takes a single-use ticket as its first message, never the bot token.

const MIME = "audio/webm;codecs=opus";
const CHUNK_MS = 100;
const BITS_PER_SECOND = 128_000;
// The socket is not keeping up: ending beats sending a stream with holes in it.
const MAX_BUFFERED_BYTES = 1_000_000;

export type CastHandle = { stop: () => void };

/** Desktop Chromium only: Firefox and Safari cannot share a tab's audio. */
export function castSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    /Chrome\//.test(navigator.userAgent) &&
    MediaRecorder.isTypeSupported(MIME)
  );
}

export class CastStartError extends Error {}

/**
 * Asks which tab to share, then starts the cast on the bot. `onEnd` runs once,
 * whichever side ended it. getDisplayMedia is called first: it needs the click
 * that started this, and a network round trip first would use that up.
 */
export async function startCast(opts: {
  name: string;
  channelId?: string;
  muteHere: boolean;
  onEnd: (reason: string) => void;
}): Promise<CastHandle> {
  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { suppressLocalAudioPlayback: opts.muteHere } as MediaTrackConstraints,
      selfBrowserSurface: "exclude",
      systemAudio: "exclude",
    } as DisplayMediaStreamOptions);
  } catch {
    throw new CastStartError("No tab was chosen.");
  }
  // The picture is never used; only the sound leaves this browser.
  media.getVideoTracks().forEach((track) => track.stop());
  const audio = media.getAudioTracks();
  if (!audio.length) {
    media.getTracks().forEach((track) => track.stop());
    throw new CastStartError('That share had no sound. Pick a tab and tick "Also share tab audio".');
  }

  let ended = false;
  let recorder: MediaRecorder | undefined;
  let socket: WebSocket | undefined;
  let started = false;
  const finish = (reason: string, stopBot = false) => {
    if (ended) return;
    ended = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    audio.forEach((track) => track.stop());
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    // A closed socket already ends the cast on the bot; this covers a stop
    // pressed before the socket was open.
    if (stopBot) void bot.castStop().catch(() => undefined);
    opts.onEnd(reason);
  };

  try {
    const { ticket } = await bot.castStart(opts.name, opts.channelId);
    started = true;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${scheme}://${window.location.host}/cast/ws`);
    socket.binaryType = "arraybuffer";
    const ws = socket;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send(ticket);
      ws.onmessage = (event) => (event.data === "ready" ? resolve() : reject(new Error("unexpected reply")));
      ws.onerror = () => reject(new Error("socket error"));
      ws.onclose = () => reject(new Error("socket closed"));
    });
    ws.onmessage = null;
    ws.onclose = () => finish("The connection to the bot closed.");

    recorder = new MediaRecorder(new MediaStream(audio), { mimeType: MIME, audioBitsPerSecond: BITS_PER_SECOND });
    // Chunks are converted in order: webm cannot be sent out of sequence.
    let queue = Promise.resolve();
    recorder.ondataavailable = (event) => {
      if (ended || !event.data.size) return;
      queue = queue.then(async () => {
        const chunk = await event.data.arrayBuffer();
        if (ended) return;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return finish("The connection is too slow to keep up.", true);
        ws.send(chunk);
      });
    };
    audio[0].onended = () => finish("Sharing stopped.", true);
    recorder.start(CHUNK_MS);
  } catch (error) {
    finish("", started);
    if (error instanceof Error && error.name === "BotError") throw error;
    throw new CastStartError("Could not reach the bot's audio socket.");
  }

  return { stop: () => finish("Stopped.", true) };
}
