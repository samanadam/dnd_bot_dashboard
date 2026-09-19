"use client";

import { BookOpen, Check, Plus, Radio, Save, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { bot, BotError } from "@/lib/bot/client";
import type { Campaign, CampaignDetail } from "@/lib/bot/types";
import { useBotOnline, useCampaign, useCampaigns, useCampaignMutation } from "@/lib/bot/useBotState";
import { useToast } from "../Providers";
import { Badge, Button, Card, EmptyState, Field, inputClass, Notice, PageHeader, Skeleton } from "../ui";

const SNOWFLAKE = /^\d{17,20}$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

function message(error: unknown, fallback: string): string {
  return error instanceof BotError ? error.message : fallback;
}

function CreateCampaign({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { online } = useBotOnline();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");
  const create = useCampaignMutation(bot.createCampaign);
  const channelValid = channel.trim() === "" || SNOWFLAKE.test(channel.trim());

  if (!canManage) return null;
  return (
    <Card title="New campaign" subtitle="Sessions, NPCs, encounters and names are kept apart per campaign" icon={Plus}>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !channelValid) return;
          create.mutate(
            { name: name.trim(), ...(channel.trim() ? { channel_id: channel.trim() } : {}) },
            {
              onSuccess: (created) => {
                setName("");
                setChannel("");
                toast("ok", `Created ${created.name}.`);
              },
              onError: (error) => toast("danger", message(error, "Could not create the campaign.")),
            },
          );
        }}
      >
        <Field label="Name">
          <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Curse of Strahd" />
        </Field>
        <Field label="Voice channel id" hint="Optional. Recordings there are filed here automatically.">
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="off"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            aria-invalid={!channelValid}
          />
        </Field>
        <Button type="submit" variant="primary" icon={Plus} busy={create.isPending} disabled={!online || !name.trim() || !channelValid}>
          Create
        </Button>
      </form>
    </Card>
  );
}

function Settings({ campaign, canManage }: { campaign: Campaign; canManage: boolean }) {
  const toast = useToast();
  const [name, setName] = useState(campaign.name);
  const [channel, setChannel] = useState(campaign.channel_id ?? "");
  const [language, setLanguage] = useState(campaign.language ?? "");
  const update = useCampaignMutation((input: Parameters<typeof bot.updateCampaign>[1]) => bot.updateCampaign(campaign.id, input));
  const channelValid = channel.trim() === "" || SNOWFLAKE.test(channel.trim());
  const languageValid = language.trim() === "" || LANGUAGE.test(language.trim());

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !channelValid || !languageValid) return;
        update.mutate(
          { name: name.trim(), channel_id: channel.trim() || null, language: language.trim() || null },
          {
            onSuccess: () => toast("ok", "Saved."),
            onError: (error) => toast("danger", message(error, "Could not save.")),
          },
        );
      }}
    >
      <Field label="Name">
        <input className={inputClass} value={name} maxLength={60} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Voice channel id" hint="Recordings in this channel are filed here.">
        <input
          className={inputClass}
          inputMode="numeric"
          value={channel}
          disabled={!canManage}
          onChange={(e) => setChannel(e.target.value)}
          aria-invalid={!channelValid}
        />
      </Field>
      <Field label="Transcript language" hint="Empty uses the bot default.">
        <input
          className={inputClass}
          value={language}
          maxLength={8}
          disabled={!canManage}
          placeholder="tr"
          onChange={(e) => setLanguage(e.target.value)}
          aria-invalid={!languageValid}
        />
      </Field>
      {canManage ? (
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" icon={Save} busy={update.isPending} disabled={!name.trim() || !channelValid || !languageValid}>
            Save
          </Button>
          <Button
            icon={campaign.archived ? Check : undefined}
            onClick={() =>
              update.mutate(
                { archived: !campaign.archived },
                { onSuccess: () => toast("ok", campaign.archived ? "Restored." : "Archived.") },
              )
            }
          >
            {campaign.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

type Correction = { heard: string; correct: string };

function Glossary({ detail, canManage }: { detail: CampaignDetail; canManage: boolean }) {
  const toast = useToast();
  const [terms, setTerms] = useState(detail.terms.join("\n"));
  const [rows, setRows] = useState<Correction[]>(detail.corrections);
  const saveTerms = useCampaignMutation((list: string[]) => bot.setTerms(detail.id, list));
  const saveFixes = useCampaignMutation((list: Correction[]) => bot.setCorrections(detail.id, list));

  const termList = terms.split("\n").map((line) => line.trim()).filter(Boolean);
  const termsValid = termList.length <= 100 && termList.every((term) => term.length <= 60);
  const cleanRows = rows.map((row) => ({ heard: row.heard.trim(), correct: row.correct.trim() })).filter((row) => row.heard && row.correct);
  const rowsValid = cleanRows.length <= 200 && cleanRows.every((row) => row.heard.length <= 80 && row.correct.length <= 80);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <Field
          label="Names to expect"
          hint="One per line: people, places, spells. Sent to the transcriber before each recording so it spells them right. The first ones matter most; the list is trimmed to fit."
        >
          <textarea
            className={`${inputClass} h-48 py-3 font-mono`}
            value={terms}
            disabled={!canManage}
            onChange={(event) => setTerms(event.target.value)}
            aria-invalid={!termsValid}
            placeholder={"Eldrin\nNeverwinter\nZhentarim"}
          />
        </Field>
        {canManage ? (
          <Button
            variant="primary"
            icon={Save}
            busy={saveTerms.isPending}
            disabled={!termsValid}
            onClick={() =>
              saveTerms.mutate(termList, {
                onSuccess: () => toast("ok", "Names saved. They apply to recordings made from now on."),
                onError: (error) => toast("danger", message(error, "Could not save the names.")),
              })
            }
          >
            Save names
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-muted">Fixes after transcription</p>
          <p className="mt-1.5 text-xs text-muted">
            When the transcript says the left column, it reads as the right one. Whole words only, any capitalisation. Applied when a transcript is
            opened, so a change fixes past sessions of this campaign too, and removing a fix undoes it.
          </p>
        </div>
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className={`${inputClass} h-10`}
                aria-label="Heard"
                value={row.heard}
                maxLength={80}
                disabled={!canManage}
                onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, heard: e.target.value } : r)))}
                placeholder="el drin"
              />
              <input
                className={`${inputClass} h-10`}
                aria-label="Should read"
                value={row.correct}
                maxLength={80}
                disabled={!canManage}
                onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, correct: e.target.value } : r)))}
                placeholder="Eldrin"
              />
              {canManage ? (
                <Button size="icon" variant="danger-ghost" aria-label="Remove fix" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                  ×
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={Plus} disabled={rows.length >= 200} onClick={() => setRows([...rows, { heard: "", correct: "" }])}>
              Add fix
            </Button>
            <Button
              variant="primary"
              icon={Save}
              busy={saveFixes.isPending}
              disabled={!rowsValid}
              onClick={() =>
                saveFixes.mutate(cleanRows, {
                  onSuccess: (saved) => {
                    setRows(saved.corrections);
                    toast("ok", "Fixes saved.");
                  },
                  onError: (error) => toast("danger", message(error, "Could not save the fixes.")),
                })
              }
            >
              Save fixes
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ campaign, canManage }: { campaign: Campaign; canManage: boolean }) {
  const detail = useCampaign(campaign.id);
  return (
    <div className="space-y-6">
      <Settings key={`${campaign.id}:${campaign.name}:${campaign.channel_id}:${campaign.language}`} campaign={campaign} canManage={canManage} />
      {detail.isPending ? (
        <Skeleton className="h-48" />
      ) : detail.isError || !detail.data ? (
        <Notice title="Could not load the names">{message(detail.error, "Try again in a moment.")}</Notice>
      ) : (
        <>
          <Glossary key={`${detail.data.id}:${detail.dataUpdatedAt}`} detail={detail.data} canManage={canManage} />
          <div>
            <p className="flex items-center gap-2 text-xs font-medium text-muted">
              <Users className="size-3.5" aria-hidden /> Characters in this campaign
            </p>
            {detail.data.characters.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                None yet. In Discord, run <span className="font-mono">/character set</span> with the campaign chosen.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {detail.data.characters.map((character) => (
                  <li key={character.character_name} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs">
                    <span className="font-medium">{character.character_name}</span>
                    {character.member ? <span className="text-muted"> · {character.member}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CampaignsPanel({ canManage }: { canManage: boolean }) {
  const campaigns = useCampaigns();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = campaigns.data ?? [];
  const open = list.find((campaign) => campaign.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Keep several games on one Discord server apart: their sessions, transcripts, names and characters."
      />
      <CreateCampaign canManage={canManage} />

      {campaigns.isPending ? (
        <Skeleton className="h-40" />
      ) : campaigns.isError ? (
        <Notice title="Campaigns unavailable">{message(campaigns.error, "Shown again once the bot answers.")}</Notice>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="No campaigns yet">
            Create one above. Recordings not filed under a campaign are transcribed without its names and can be filed later.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-2" aria-label="Campaigns">
            {list.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  aria-pressed={campaign.id === openId}
                  onClick={() => setOpenId(campaign.id === openId ? null : campaign.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                    campaign.id === openId ? "border-accent/60 bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
                  } ${campaign.archived ? "opacity-60" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">{campaign.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {campaign.session_count} session{campaign.session_count === 1 ? "" : "s"}
                      {campaign.channel_id ? (
                        <span className="inline-flex items-center gap-1">
                          <Radio className="size-3" aria-hidden /> channel set
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {campaign.archived ? <Badge>Archived</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
          <Card title={open ? open.name : "Pick a campaign"} icon={Sparkles}>
            {open ? (
              <Detail campaign={open} canManage={canManage} />
            ) : (
              <p className="text-sm text-muted">Choose a campaign on the left to edit its channel, names and fixes.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
