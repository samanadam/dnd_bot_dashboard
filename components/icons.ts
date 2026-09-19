import { AudioLines, BookOpen, Dices, Gauge, History, Music2, ScrollText, Search, Sparkles, Swords, Users, type LucideIcon } from "lucide-react";
import type { IconName } from "@/lib/tools/registry";

export const ICON_BY_NAME: Record<IconName, LucideIcon> = {
  dice: Dices,
  gauge: Gauge,
  music: Music2,
  history: History,
  sparkles: Sparkles,
  scroll: ScrollText,
  book: BookOpen,
  users: Users,
  swords: Swords,
  audio: AudioLines,
  search: Search,
};
