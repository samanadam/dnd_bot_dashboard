"use client";

import { Circle, Radio } from "lucide-react";
import { useState } from "react";
import { bot } from "@/lib/bot/client";
import { useActiveRecordings, useBotOnline, useBotPresence, useRecordingMutation } from "@/lib/bot/useBotState";
import { useCampaigns } from "@/lib/bot/useBotState";
import { useLocalValue } from "@/lib/useLocalValue";
import { CampaignSelect } from "../CampaignSelect";
import { useToast } from "../Providers";
import { Button, Card, Field, inputClass } from "../ui";

const SNOWFLAKE = /^\d{17,20}$/;

export function StartRecording() {
  const { online } = useBotOnline();
  const active = useActiveRecordings();
  const toast = useToast();
  const presence = useBotPresence();
  const [storedChannelId, setChannelId] = useLocalValue("portal.bot.voiceChannelId");
  const [edited, setEdited] = useState(false);
  // While the bot sits in a voice channel, that channel is the default target.
  const botChannel = presence.kind === "in_voice" ? presence.channelId : null;
  const channelId = botChannel && !edited ? botChannel : storedChannelId;
  const [textChannelId, setTextChannelId] = useLocalValue("portal.bot.textChannelId");
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const campaigns = useCampaigns();
  const start = useRecordingMutation(bot.startRecording);

  const channel = channelId.trim();
  const textChannel = textChannelId.trim();
  const channelValid = SNOWFLAKE.test(channel);
  const textValid = textChannel === "" || SNOWFLAKE.test(textChannel);
  const alreadyRecording = active.data?.some((session) => session.channel_id === channel) ?? false;
  // What the bot will do when no campaign is chosen here: the channel's own.
  const channelDefault = campaigns.data?.find((campaign) => campaign.channel_id === channel && !campaign.archived) ?? null;

  return (
    <Card title="Start recording" subtitle="Joins the channel and records everyone in it" icon={Circle}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!channelValid || !textValid) return;
          start.mutate(
            {
              channel_id: channel,
              ...(name.trim() ? { name: name.trim() } : {}),
              ...(textChannel ? { text_channel_id: textChannel } : {}),
              ...(campaignId ? { campaign_id: campaignId } : {}),
            },
            {
              onSuccess: (session) => {
                setName("");
                toast("ok", `Recording in #${session.channel_name}.`);
              },
            },
          );
        }}
      >
        <Field
          label="Voice channel id"
          hint={
            botChannel && channel === botChannel ? (
              <span className="inline-flex items-center gap-1 text-ok">
                <Radio className="size-3" aria-hidden /> The channel the bot is in right now
              </span>
            ) : (
              "In Discord: right-click the channel, Copy Channel ID. Remembered on this device."
            )
          }
        >
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="off"
            value={channelId}
            onChange={(event) => {
              setEdited(true);
              setChannelId(event.target.value);
            }}
            aria-invalid={channelId !== "" && !channelValid}
            placeholder="123456789012345678"
          />
        </Field>
        <Field label="Session name" hint="Optional.">
          <input
            className={inputClass}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Session 12: The Sunken Keep"
          />
        </Field>
        <Field
          label="Campaign"
          hint={
            campaignId
              ? "Filed under this campaign, whatever the channel."
              : channelDefault
                ? `Left alone, this recording is filed under ${channelDefault.name}.`
                : "Left alone, this recording is not filed under any campaign. You can file it later."
          }
        >
          <CampaignSelect label="Campaign" noneLabel={channelDefault ? `Channel default (${channelDefault.name})` : "None"} value={campaignId} onChange={setCampaignId} />
        </Field>
        <Field label="Text channel id" hint="Optional. Where the transcript is posted.">
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="off"
            value={textChannelId}
            onChange={(event) => setTextChannelId(event.target.value)}
            aria-invalid={!textValid}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          icon={Circle}
          busy={start.isPending}
          disabled={!online || !channelValid || !textValid || alreadyRecording}
        >
          {alreadyRecording ? "Already recording there" : "Start recording"}
        </Button>
      </form>
    </Card>
  );
}
