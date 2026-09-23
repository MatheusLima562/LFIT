"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { createClient } from "@/lib/db/client";
import { isoToBR, timestampToISODate, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fromE164 } from "@/lib/phone";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveStudent, setStudentPhoto } from "../actions";
import type { StudentForEdit, StudentFormOptions } from "../queries";
import { emptyStudentForm, studentFormSchema, type StudentFormInput } from "../schemas";
import { DateField } from "./form/DateField";
import { GroupsField, type GroupOption } from "./form/GroupsField";
import { PhoneField } from "./form/PhoneField";
import { PHOTO_TYPES, PhotoField, type PhotoValue } from "./form/PhotoField";

const t = messages.studentForm;
const NONE = "none";

interface StudentFormDialogProps {
  mode: "create" | "edit";
  student: StudentForEdit | null;
  options: StudentFormOptions;
  role: "owner" | "trainer";
  currentUserId: string;
  organizationId: string;
  planLimit: number;
  closeHref: string;
}

function initialValues(student: StudentForEdit | null, role: "owner" | "trainer", currentUserId: string): StudentFormInput {
  if (!student) return { ...emptyStudentForm, trainerId: role === "trainer" ? currentUserId : "" };
  const phone = fromE164(student.whatsapp);
  return {
    ...emptyStudentForm,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    birthDate: student.birthDate ? isoToBR(student.birthDate) : "",
    sex: student.sex ?? "",
    phoneCountry: phone.country,
    phone: phone.national,
    trainerId: student.trainerId ?? "",
    groupIds: student.groupIds,
    consentOnFile: Boolean(student.healthConsentAt),
    accessExpiresOn: student.accessExpiresAt ? isoToBR(timestampToISODate(student.accessExpiresAt)) : "",
    trainingLocation: student.trainingLocation ?? "",
    notes: student.notes ?? "",
    // Na edição nada é reenviado sem o usuário pedir.
    sendInvite: false,
    blockIfOverdue: student.blockIfOverdue,
  };
}

export function StudentFormDialog({
  mode,
  student,
  options,
  role,
  currentUserId,
  organizationId,
  planLimit,
  closeHref,
}: StudentFormDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [groups, setGroups] = useState<GroupOption[]>(options.groups);
  const [photo, setPhoto] = useState<PhotoValue>({ file: null, removed: false });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState<number | null>(null);
  const defaults = useMemo(() => initialValues(student, role, currentUserId), [student, role, currentUserId]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<StudentFormInput>({ resolver: zodResolver(studentFormSchema), defaultValues: defaults });

  const close = () => router.replace(closeHref, { scroll: false });
  const [groupIds, sendAnamnesis, firstName, lastName] = useWatch({
    control,
    name: ["groupIds", "sendAnamnesis", "firstName", "lastName"],
  });
  const trainerName = options.trainers.find((tr) => tr.id === student?.trainerId)?.name;

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    setLimitReached(null);
    startTransition(async () => {
      const result = await saveStudent(values, student?.id);
      if (!result.ok) {
        if (result.field === "email") setError("email", { message: result.error });
        else if (result.planLimit) setLimitReached(result.limit ?? planLimit);
        else setServerError(result.error);
        return;
      }

      const warnings = [...result.warnings];
      if (photo.file) {
        const ext = PHOTO_TYPES[photo.file.type as keyof typeof PHOTO_TYPES];
        const path = `${organizationId}/${result.studentId}/${crypto.randomUUID()}.${ext}`;
        const upload = await createClient().storage.from("student-photos").upload(path, photo.file, {
          contentType: photo.file.type,
        });
        const saved = upload.error ? null : await setStudentPhoto(result.studentId, path);
        if (!saved?.ok) warnings.push(t.warnings.photo);
      } else if (photo.removed && student?.photoPath) {
        await setStudentPhoto(result.studentId, null);
      }

      toast.success(result.message);
      warnings.forEach((w) => toast.warning(w, { duration: 10_000 }));
      close();
    });
  });

  const notFound = mode === "edit" && !student;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && close()}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-line px-5 py-4 sm:px-6">
          <DialogTitle>{mode === "create" ? t.newTitle : t.editTitle}</DialogTitle>
          <DialogDescription>{mode === "create" ? t.newDescription : t.editDescription}</DialogDescription>
        </DialogHeader>

        {notFound ? (
          <p className="px-6 py-10 text-center text-sm text-ink-2">{t.notFound}</p>
        ) : (
          <form id="student-form" onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {serverError && (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
                {serverError}
              </p>
            )}

            <div className="flex flex-col gap-7">
              {/* Identificação */}
              <FieldSet>
                <FieldLegend>{t.sections.identity}</FieldLegend>
                <PhotoField
                  name={`${firstName} ${lastName}`.trim()}
                  currentUrl={student?.photoUrl ?? null}
                  value={photo}
                  onChange={setPhoto}
                  onError={setPhotoError}
                />
                {photoError && <p role="alert" className="text-[13px] text-red-700">{photoError}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.firstName}>
                    <FieldLabel htmlFor="firstName">{t.firstName} *</FieldLabel>
                    <Input id="firstName" autoComplete="off" aria-invalid={!!errors.firstName} {...register("firstName")} />
                    <FieldError errors={[errors.firstName]} />
                  </Field>
                  <Field data-invalid={!!errors.lastName}>
                    <FieldLabel htmlFor="lastName">{t.lastName} *</FieldLabel>
                    <Input id="lastName" autoComplete="off" aria-invalid={!!errors.lastName} {...register("lastName")} />
                    <FieldError errors={[errors.lastName]} />
                  </Field>
                  <Field data-invalid={!!errors.email} className="sm:col-span-2">
                    <FieldLabel htmlFor="email">{t.email} *</FieldLabel>
                    <Input id="email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
                    <FieldError errors={[errors.email]} />
                  </Field>
                  <Field data-invalid={!!errors.birthDate}>
                    <FieldLabel htmlFor="birthDate">{t.birthDate}</FieldLabel>
                    <Controller
                      control={control}
                      name="birthDate"
                      render={({ field }) => (
                        <DateField
                          id="birthDate"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          invalid={!!errors.birthDate}
                          min="1920-01-01"
                          max={todayISO()}
                        />
                      )}
                    />
                    <FieldError errors={[errors.birthDate]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sex">{t.sex}</FieldLabel>
                    <Controller
                      control={control}
                      name="sex"
                      render={({ field }) => (
                        <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                          <SelectTrigger id="sex" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{t.sexNone}</SelectItem>
                            <SelectItem value="F">{messages.students.sex.F}</SelectItem>
                            <SelectItem value="M">{messages.students.sex.M}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field data-invalid={!!errors.phone} className="sm:col-span-2">
                    <FieldLabel htmlFor="phone">{t.whatsapp}</FieldLabel>
                    <Controller
                      control={control}
                      name="phone"
                      render={({ field }) => (
                        <Controller
                          control={control}
                          name="phoneCountry"
                          render={({ field: countryField }) => (
                            <PhoneField
                              id="phone"
                              country={countryField.value}
                              onCountryChange={countryField.onChange}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              invalid={!!errors.phone}
                            />
                          )}
                        />
                      )}
                    />
                    <FieldError errors={[errors.phone]} />
                  </Field>
                </div>
              </FieldSet>

              {/* Acompanhamento */}
              <FieldSet>
                <FieldLegend>{t.sections.follow}</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="trainerId">{t.trainer}</FieldLabel>
                  {role === "owner" ? (
                    <Controller
                      control={control}
                      name="trainerId"
                      render={({ field }) => (
                        <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                          <SelectTrigger id="trainerId" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{t.noTrainer}</SelectItem>
                            {options.trainers.map((tr) => (
                              <SelectItem key={tr.id} value={tr.id}>
                                {tr.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <p id="trainerId" className="text-[13px] text-ink-2">
                      {mode === "create" ? t.trainerSelf : (trainerName ?? t.noTrainer)}
                    </p>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="groups">{t.groups}</FieldLabel>
                  <Controller
                    control={control}
                    name="groupIds"
                    render={({ field }) => (
                      <GroupsField
                        id="groups"
                        groups={groups}
                        value={field.value}
                        onChange={field.onChange}
                        onGroupCreated={(g) => setGroups((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}
                        describedBy="groups-hint"
                      />
                    )}
                  />
                  <FieldDescription id="groups-hint">{t.groupsHint}</FieldDescription>
                </Field>

                {groupIds.length > 0 &&
                  (defaults.consentOnFile && student?.healthConsentAt ? (
                    <p className="text-[13px] text-ink-2">{t.consentOnFile(formatDate(student.healthConsentAt))}</p>
                  ) : (
                    <Field orientation="horizontal" data-invalid={!!errors.healthConsent}>
                      <Controller
                        control={control}
                        name="healthConsent"
                        render={({ field }) => (
                          <Checkbox
                            id="healthConsent"
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                            aria-invalid={!!errors.healthConsent}
                          />
                        )}
                      />
                      <div className="flex flex-col gap-1">
                        <FieldLabel htmlFor="healthConsent" className="font-normal leading-snug">
                          {t.consent}
                        </FieldLabel>
                        <FieldError errors={[errors.healthConsent]} />
                      </div>
                    </Field>
                  ))}

                <Field>
                  <FieldLabel htmlFor="trainingLocation">{t.trainingLocation}</FieldLabel>
                  <Input id="trainingLocation" placeholder={t.trainingLocationPlaceholder} {...register("trainingLocation")} />
                </Field>
                <Field data-invalid={!!errors.notes}>
                  <FieldLabel htmlFor="notes">{t.notes}</FieldLabel>
                  <Textarea id="notes" rows={3} aria-describedby="notes-hint" {...register("notes")} />
                  <FieldDescription id="notes-hint">{t.notesHint}</FieldDescription>
                  <FieldError errors={[errors.notes]} />
                </Field>
              </FieldSet>

              {/* Acesso */}
              <FieldSet>
                <FieldLegend>{t.sections.access}</FieldLegend>
                <Field data-invalid={!!errors.accessExpiresOn} className="sm:max-w-xs">
                  <FieldLabel htmlFor="accessExpiresOn">{t.expiresOn}</FieldLabel>
                  <Controller
                    control={control}
                    name="accessExpiresOn"
                    render={({ field }) => (
                      <DateField
                        id="accessExpiresOn"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={!!errors.accessExpiresOn}
                        describedBy="expires-hint"
                      />
                    )}
                  />
                  <FieldDescription id="expires-hint">{t.expiresHint}</FieldDescription>
                  <FieldError errors={[errors.accessExpiresOn]} />
                </Field>

                <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {(
                    [
                      { name: "sendInvite", label: t.sendInvite, hint: t.sendInviteHint },
                      { name: "sendAnamnesis", label: t.sendAnamnesis, hint: t.sendAnamnesisHint },
                      { name: "blockIfOverdue", label: t.blockIfOverdue, hint: t.blockIfOverdueHint(options.overdueGraceDays) },
                    ] as const
                  ).map((item) => (
                    <div key={item.name} className="flex flex-col gap-3 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <FieldLabel htmlFor={item.name}>{item.label}</FieldLabel>
                          <p className="mt-0.5 text-xs text-ink-3">{item.hint}</p>
                        </div>
                        <Controller
                          control={control}
                          name={item.name}
                          render={({ field }) => (
                            <Switch id={item.name} checked={field.value} onCheckedChange={field.onChange} />
                          )}
                        />
                      </div>
                      {item.name === "sendAnamnesis" && sendAnamnesis && (
                        <Field data-invalid={!!errors.anamnesisTemplateId}>
                          <FieldLabel htmlFor="anamnesisTemplateId" className="sr-only">
                            {t.template}
                          </FieldLabel>
                          {options.templates.length === 0 ? (
                            <p className="text-[13px] text-ink-3">{t.noTemplates}</p>
                          ) : (
                            <Controller
                              control={control}
                              name="anamnesisTemplateId"
                              render={({ field }) => (
                                <Select value={field.value || undefined} onValueChange={field.onChange}>
                                  <SelectTrigger id="anamnesisTemplateId" className="w-full" aria-invalid={!!errors.anamnesisTemplateId}>
                                    <SelectValue placeholder={t.templatePlaceholder} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.templates.map((tpl) => (
                                      <SelectItem key={tpl.id} value={tpl.id}>
                                        {tpl.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          )}
                          <FieldError errors={[errors.anamnesisTemplateId]} />
                        </Field>
                      )}
                    </div>
                  ))}
                </div>
              </FieldSet>
            </div>
          </form>
        )}

        {limitReached !== null && (
          <div role="alert" className="mx-5 mb-1 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:mx-6">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-800" />
            <div className="text-[13px] text-amber-800">
              <p className="font-semibold">{t.limitTitle}</p>
              <p className="mt-0.5">{t.limitText(limitReached)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled title={messages.app.soonHint}>
                  {t.upgrade} · {messages.app.soon}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/alunos">{t.seeActive}</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 border-line bg-surface px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            {t.cancel}
          </Button>
          {!notFound && (
            <Button type="submit" form="student-form" disabled={pending}>
              {pending ? t.saving : mode === "create" ? t.create : t.save}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
