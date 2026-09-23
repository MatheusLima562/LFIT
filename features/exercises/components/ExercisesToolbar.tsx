"use client";

import { Search, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUSCLE_GROUPS, type MuscleGroup } from "../constants";
import type { ConditionOption } from "../queries";
import { EXERCISE_ORIGINS, exerciseListHref, type ExerciseListParams, type ExerciseOrigin } from "../search-params";

const t = messages.exercises;
const ALL = "all";

interface Props {
  params: ExerciseListParams;
  equipment: string[];
  conditions: ConditionOption[];
}

export function ExercisesToolbar({ params, equipment, conditions }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(params.q ?? "");
  const [, startTransition] = useTransition();

  const navigate = (patch: Partial<ExerciseListParams>) =>
    startTransition(() => router.replace(exerciseListHref({ ...params, page: 1, ...patch }), { scroll: false }));

  useEffect(() => {
    if (query.trim() === (params.q ?? "")) return;
    const timer = setTimeout(() => navigate({ q: query.trim() || undefined }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara só quando o texto muda
  }, [query]);

  const hasFilters = Boolean(params.q || params.grupo || params.equip || params.condicao || params.origem !== "all");
  const trigger = "h-9 rounded-xl bg-surface shadow-card";

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div role="search" className="relative min-w-0 flex-1 xl:max-w-sm xl:min-w-64">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="search"
          aria-label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 rounded-xl bg-surface pl-9 shadow-card"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={params.origem} onValueChange={(v) => navigate({ origem: v as ExerciseOrigin })}>
          <SelectTrigger aria-label={t.filters.origin} className={`${trigger} w-[10.5rem]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_ORIGINS.map((o) => (
              <SelectItem key={o} value={o}>
                {t.origin[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.grupo ?? ALL} onValueChange={(v) => navigate({ grupo: v === ALL ? undefined : (v as MuscleGroup) })}>
          <SelectTrigger aria-label={t.filters.muscle} className={`${trigger} w-[11rem]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.filters.allMuscles}</SelectItem>
            {MUSCLE_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>
                {messages.muscleGroups[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.equip ?? ALL} onValueChange={(v) => navigate({ equip: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label={t.filters.equipment} className={`${trigger} w-[12rem]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.filters.allEquipment}</SelectItem>
            {equipment.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={params.condicao ?? ALL} onValueChange={(v) => navigate({ condicao: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label={t.filters.condition} title={t.filters.condition} className={`${trigger} w-[13.5rem]`}>
            <ShieldAlert aria-hidden className="text-ink-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.filters.anyCondition}</SelectItem>
            {conditions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            className="text-ink-2"
            onClick={() => {
              setQuery("");
              navigate({ q: undefined, grupo: undefined, equip: undefined, condicao: undefined, origem: "all" });
            }}
          >
            <X aria-hidden />
            {t.filters.clear}
          </Button>
        )}
      </div>
    </div>
  );
}
