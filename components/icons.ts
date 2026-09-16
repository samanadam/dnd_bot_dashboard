import { Dices, Gauge, History, Music2, Sparkles, type LucideIcon } from "lucide-react";
import type { IconName } from "@/lib/tools/registry";

export const ICON_BY_NAME: Record<IconName, LucideIcon> = {
  dice: Dices,
  gauge: Gauge,
  music: Music2,
  history: History,
  sparkles: Sparkles,
};
