import { Film } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { VideoUsage } from "../queries";

const t = messages.exercises.media;

export function VideoUsageBar({ usage }: { usage: VideoUsage }) {
  if (usage.quotaBytes === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 shadow-card">
        <Film aria-hidden className="size-4 text-ink-3" />
        <span className="flex-1">{t.freePlan}</span>
        <Button size="sm" disabled title={messages.app.soonHint}>
          {t.upgrade} · {messages.app.soon}
        </Button>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100));
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card sm:flex-row sm:items-center sm:gap-4">
      <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <Film aria-hidden className="size-4 text-ink-3" />
        {t.usage}
      </p>
      <div className="flex-1">
        <ProgressBar value={pct} max={100} label={t.usage} />
      </div>
      <p className="tabular text-[13px] text-ink-2">{t.usageText(formatBytes(usage.usedBytes), formatBytes(usage.quotaBytes))}</p>
    </div>
  );
}
