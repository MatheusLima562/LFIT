"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Info, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkVideoQuota, removeExerciseVideo, saveExercise, saveExerciseDefaults, setExerciseVideo } from "../actions";
import type { ExerciseDefaults } from "../defaults";
import { DefaultsField, defaultsDraft, defaultsPayload, type DefaultsDraft } from "./DefaultsField";
import { VIDEO_TYPES } from "../video";
import { VideoField, type VideoFieldState } from "./VideoField";
import { createClient } from "@/lib/db/client";
import { CONTRAINDICATION_LEVELS, MUSCLE_GROUPS, type ContraindicationLevel } from "../constants";
import type { ConditionOption, ExerciseDetail } from "../queries";
import { emptyExerciseForm, exerciseFormSchema, type ExerciseFormInput } from "../schemas";
import { LevelBadge } from "./LevelBadge";

const t = messages.exercises;

interface Props {
  exercise: ExerciseDetail | null;
  conditions: ConditionOption[];
  equipment: string[];
  closeHref: string;
  organizationId: string;
  videoQuotaBytes: number;
  videoUsedBytes: number;
  /** Padrões atuais (LFit e da equipe) do exercício em edição. */
  exerciseDefaults?: { global: ExerciseDefaults | null; team: ExerciseDefaults | null };
}

function initialValues(exercise: ExerciseDetail | null): ExerciseFormInput {
  if (!exercise) return emptyExerciseForm;
  return {
    name: exercise.name,
    muscleGroups: exercise.muscleGroups,
    equipment: exercise.equipment ?? "",
    instructions: exercise.instructions ?? "",
    videoUrl: exercise.videoUrl ?? "",
    // Só a camada da equipe é editável; regras globais aparecem à parte.
    rules: exercise.rules.filter((r) => !r.isGlobal).map((r) => ({ conditionId: r.conditionId, level: r.level, note: r.note ?? "" })),
  };
}

export function ExerciseFormDialog({ exercise, conditions, equipment, closeHref, organizationId, videoQuotaBytes, videoUsedBytes, exerciseDefaults }: Props) {
  const initialDefaults = useMemo(() => defaultsDraft(exerciseDefaults?.team ?? null, exerciseDefaults?.global ?? null), [exerciseDefaults]);
  const [defaultsValue, setDefaultsValue] = useState<DefaultsDraft>(initialDefaults);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = useMemo(() => initialValues(exercise), [exercise]);
  const rulesOnly = exercise?.isGlobal ?? false;
  const [video, setVideo] = useState<VideoFieldState>({ prepared: null, removeCurrent: false, busy: false });
  const [uploading, setUploading] = useState(false);

  /** Envia o vídeo preparado depois de o exercício existir (o caminho usa o id). Devolve avisos. */
  const commitVideo = async (id: string): Promise<string[]> => {
    if (video.prepared) {
      const p = video.prepared;
      const quota = await checkVideoQuota(id, p.file.size + (p.poster?.size ?? 0));
      if (!quota.ok) return [quota.error];
      setUploading(true);
      const storage = createClient().storage.from("exercise-media");
      const base = `${organizationId}/${id}/`;
      const videoPath = `${base}${crypto.randomUUID()}.${VIDEO_TYPES[p.mime]}`;
      const up = await storage.upload(videoPath, p.file, { contentType: p.mime, cacheControl: "604800" });
      if (up.error) return [t.media.errors.upload];
      let posterPath: string | null = null;
      if (p.poster) {
        const candidate = `${base}${crypto.randomUUID()}.jpg`;
        const pu = await storage.upload(candidate, p.poster, { contentType: "image/jpeg", cacheControl: "604800" });
        if (!pu.error) posterPath = candidate;
      }
      const r = await setExerciseVideo(id, videoPath, posterPath);
      return r.ok ? [] : [r.error];
    }
    if (video.removeCurrent && exercise?.video) {
      const r = await removeExerciseVideo(id);
      return r.ok ? [] : [r.error];
    }
    return [];
  };

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ExerciseFormInput>({ resolver: zodResolver(exerciseFormSchema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "rules" });
  const rules = useWatch({ control, name: "rules" });

  const close = () => router.replace(closeHref, { scroll: false });
  const globalRules = exercise?.rules.filter((r) => r.isGlobal) ?? [];
  const usedConditions = new Set(rules.map((r) => r.conditionId));

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const r = await saveExercise(values, exercise?.id);
      if (!r.ok) {
        if (r.field === "name") setError("name", { message: r.error });
        else setServerError(r.error);
        return;
      }
      const warnings = rulesOnly ? [] : await commitVideo(r.id);
      // Padrões da equipe: só grava se mudaram.
      if (JSON.stringify(defaultsValue) !== JSON.stringify(initialDefaults)) {
        const d = await saveExerciseDefaults(r.id, defaultsPayload(defaultsValue));
        if (!d.ok) warnings.push(d.error);
      }
      setUploading(false);
      toast.success(rulesOnly ? t.rulesSaved : r.message);
      warnings.forEach((w) => toast.warning(w, { duration: 10_000 }));
      router.replace(closeHref.includes("?") ? `${closeHref}&ver=${r.id}` : `${closeHref}?ver=${r.id}`, { scroll: false });
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && close()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-line px-5 py-4 sm:px-6">
          <DialogTitle>{rulesOnly ? `${t.editRules}: ${exercise?.name}` : exercise ? t.edit : t.new}</DialogTitle>
          <DialogDescription>{rulesOnly ? t.readOnlyGlobal : t.subtitle}</DialogDescription>
        </DialogHeader>

        <form id="exercise-form" onSubmit={onSubmit} className="flex flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6" noValidate>
          {!rulesOnly && (
            <>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="ex-name">{t.form.name}</FieldLabel>
                <Input id="ex-name" maxLength={120} placeholder={t.form.namePlaceholder} aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </Field>

              <Controller
                control={control}
                name="muscleGroups"
                render={({ field }) => (
                  <fieldset aria-invalid={!!errors.muscleGroups} className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium text-ink">{t.form.muscles}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {MUSCLE_GROUPS.map((g) => {
                        const on = field.value.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            aria-pressed={on}
                            onClick={() => field.onChange(on ? field.value.filter((x) => x !== g) : [...field.value, g])}
                            className={cn(
                              "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                              on ? "border-brand-300 bg-brand-50 font-medium text-brand-700" : "border-line bg-surface text-ink-2 hover:text-ink",
                            )}
                          >
                            {on && <Check aria-hidden className="size-3.5" />}
                            {messages.muscleGroups[g]}
                          </button>
                        );
                      })}
                    </div>
                    {errors.muscleGroups && <p className="text-sm text-destructive">{errors.muscleGroups.message}</p>}
                  </fieldset>
                )}
              />

              <Field>
                <FieldLabel htmlFor="ex-equipment">{t.form.equipment}</FieldLabel>
                <Input id="ex-equipment" list="ex-equipment-list" maxLength={80} placeholder={t.form.equipmentPlaceholder} {...register("equipment")} />
                <datalist id="ex-equipment-list">
                  {equipment.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </Field>

              <Field>
                <FieldLabel htmlFor="ex-instructions">{t.form.instructions}</FieldLabel>
                <Textarea id="ex-instructions" rows={4} maxLength={2000} placeholder={t.form.instructionsPlaceholder} {...register("instructions")} />
              </Field>

              <VideoField
                hasCurrent={Boolean(exercise?.video)}
                quotaBytes={videoQuotaBytes}
                usedBytes={videoUsedBytes - (exercise?.mediaBytes ?? 0)}
                state={video}
                onChange={setVideo}
                initialTab={exercise?.video ? "upload" : "link"}
                linkField={
                  <Field data-invalid={!!errors.videoUrl}>
                    <FieldLabel htmlFor="ex-video">{t.form.videoUrl}</FieldLabel>
                    <Input id="ex-video" type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" aria-invalid={!!errors.videoUrl} {...register("videoUrl")} />
                    {errors.videoUrl ? <FieldError>{errors.videoUrl.message}</FieldError> : <FieldDescription>{t.form.videoUrlHint}</FieldDescription>}
                  </Field>
                }
              />
            </>
          )}

          <DefaultsField value={defaultsValue} lfit={exerciseDefaults?.global ?? null} onChange={setDefaultsValue} />

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t.rules.title}</h3>
              <p className="mt-0.5 flex gap-1.5 text-xs text-ink-3">
                <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                {t.rules.hint}
              </p>
            </div>

            {globalRules.length > 0 && (
              <div className="rounded-xl bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold text-ink-2">{t.rules.globalTitle}</p>
                <ul className="flex flex-col gap-1.5">
                  {globalRules.map((r) => (
                    <li key={r.conditionId} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <LevelBadge level={r.level} />
                      <span className="font-medium text-ink">{r.conditionName}</span>
                      {r.note && <span className="text-ink-2">— {r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {globalRules.length > 0 && <p className="text-xs font-semibold text-ink-2">{t.rules.teamTitle}</p>}
            <ul className="flex flex-col gap-3">
              {fields.map((f, i) => {
                const err = errors.rules?.[i];
                return (
                  <li key={f.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_9rem_auto]">
                    <Controller
                      control={control}
                      name={`rules.${i}.conditionId`}
                      render={({ field }) => (
                        <Field data-invalid={!!err?.conditionId}>
                          <FieldLabel className="sr-only">{t.rules.condition}</FieldLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger aria-label={t.rules.condition} aria-invalid={!!err?.conditionId} className="w-full">
                              <SelectValue placeholder={t.rules.conditionPlaceholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {conditions.map((c) => (
                                <SelectItem key={c.id} value={c.id} disabled={c.id !== field.value && usedConditions.has(c.id)}>
                                  {c.name}
                                  {!c.isGlobal && <span className="text-ink-3"> · {t.ownBadge}</span>}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {err?.conditionId && <FieldError>{err.conditionId.message}</FieldError>}
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`rules.${i}.level`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={(v) => field.onChange(v as ContraindicationLevel)}>
                          <SelectTrigger aria-label={t.rules.level} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTRAINDICATION_LEVELS.map((l) => (
                              <SelectItem key={l} value={l}>
                                {t.levels[l]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={t.rules.remove} className="justify-self-end hover:text-danger" onClick={() => remove(i)}>
                      <Trash2 aria-hidden />
                    </Button>
                    <Input
                      aria-label={t.rules.note}
                      placeholder={`${t.rules.note} — ${t.rules.notePlaceholder}`}
                      maxLength={300}
                      className="sm:col-span-3"
                      {...register(`rules.${i}.note`)}
                    />
                  </li>
                );
              })}
            </ul>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ conditionId: "", level: "caution", note: "" })}>
                <Plus aria-hidden />
                {t.rules.add}
              </Button>
            </div>
          </section>

          {serverError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}
        </form>

        <DialogFooter className="border-t border-line px-5 py-3 sm:px-6">
          <Button variant="ghost" onClick={close} disabled={pending}>
            {messages.students.confirm.cancel}
          </Button>
          {uploading && (
            <span role="status" className="mr-auto self-center text-[13px] text-ink-2">
              {t.media.uploading}
            </span>
          )}
          <Button type="submit" form="exercise-form" disabled={pending || video.busy}>
            {exercise ? messages.groups.save : t.new}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
