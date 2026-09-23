"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { todayISO } from "@/lib/dates";
import { messages } from "@/messages/pt-BR";
import { AuthMessage } from "@/features/auth/components/AuthMessage";
import { DateField } from "@/features/students/components/form/DateField";
import { PhoneField } from "@/features/students/components/form/PhoneField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitPublicSignup } from "../actions";
import { emptyPublicSignup, publicSignupSchema, type PublicSignupInput, type SignupConfig } from "../schemas";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

const p = messages.signup.public;
const f = messages.studentForm;
const NONE = "none";

export function PublicSignupForm({ token, config, siteKey }: { token: string; config: SignupConfig; siteKey: string }) {
  const schema = useMemo(() => publicSignupSchema(config), [config]);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const turnstile = useRef<TurnstileHandle>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PublicSignupInput>({ resolver: zodResolver(schema), defaultValues: emptyPublicSignup });
  const healthDescription = useWatch({ control, name: "healthDescription" });

  const show = (field: keyof SignupConfig) => config[field] !== "hidden";
  const req = (field: keyof SignupConfig) => (config[field] === "required" ? " *" : "");

  const submit = (values: PublicSignupInput) => {
    setServerError(null);
    if (!captcha) return setServerError(p.captchaRequired);
    startTransition(async () => {
      const result = await submitPublicSignup(token, values, captcha);
      if (result.ok) return setDone(true);
      if (result.field && result.field in values) setError(result.field, { message: result.error });
      else setServerError(result.error);
      turnstile.current?.reset(); // tokens do Turnstile são de uso único
    });
  };

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-4">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <CircleCheck className="size-6" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{p.doneTitle}</h2>
        <p className="text-sm text-ink-2">{p.doneText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => handleSubmit(submit)(e)} noValidate className="flex flex-col gap-5">
      {serverError && <AuthMessage tone="error">{serverError}</AuthMessage>}

      {/* Honeypot: fora da tela e fora da navegação; pessoas não veem, bots preenchem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">{p.honeypotLabel}</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.firstName}>
            <FieldLabel htmlFor="firstName">{f.firstName} *</FieldLabel>
            <Input id="firstName" autoComplete="given-name" aria-invalid={!!errors.firstName} {...register("firstName")} />
            <FieldError errors={[errors.firstName]} />
          </Field>
          <Field data-invalid={!!errors.lastName}>
            <FieldLabel htmlFor="lastName">{f.lastName} *</FieldLabel>
            <Input id="lastName" autoComplete="family-name" aria-invalid={!!errors.lastName} {...register("lastName")} />
            <FieldError errors={[errors.lastName]} />
          </Field>
        </div>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">{f.email} *</FieldLabel>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>

        {(show("birth_date") || show("sex")) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {show("birth_date") && (
              <Field data-invalid={!!errors.birthDate}>
                <FieldLabel htmlFor="birthDate">{f.birthDate}{req("birth_date")}</FieldLabel>
                <Controller
                  control={control}
                  name="birthDate"
                  render={({ field }) => (
                    <DateField id="birthDate" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.birthDate} min="1920-01-01" max={todayISO()} />
                  )}
                />
                <FieldError errors={[errors.birthDate]} />
              </Field>
            )}
            {show("sex") && (
              <Field data-invalid={!!errors.sex}>
                <FieldLabel htmlFor="sex">{f.sex}{req("sex")}</FieldLabel>
                <Controller
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                      <SelectTrigger id="sex" className="w-full" aria-invalid={!!errors.sex}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{f.sexNone}</SelectItem>
                        <SelectItem value="F">{messages.students.sex.F}</SelectItem>
                        <SelectItem value="M">{messages.students.sex.M}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.sex]} />
              </Field>
            )}
          </div>
        )}

        {show("whatsapp_e164") && (
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="phone">{f.whatsapp}{req("whatsapp_e164")}</FieldLabel>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <Controller
                  control={control}
                  name="phoneCountry"
                  render={({ field: country }) => (
                    <PhoneField id="phone" country={country.value} onCountryChange={country.onChange} value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.phone} />
                  )}
                />
              )}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
        )}

        {show("training_location") && (
          <Field data-invalid={!!errors.trainingLocation}>
            <FieldLabel htmlFor="trainingLocation">{f.trainingLocation}{req("training_location")}</FieldLabel>
            <Input id="trainingLocation" placeholder={f.trainingLocationPlaceholder} {...register("trainingLocation")} />
            <FieldError errors={[errors.trainingLocation]} />
          </Field>
        )}

        {show("health_description") && (
          <>
            <Field data-invalid={!!errors.healthDescription}>
              <FieldLabel htmlFor="healthDescription">{p.healthLabel}{req("health_description")}</FieldLabel>
              <Textarea id="healthDescription" rows={3} maxLength={1000} aria-describedby="health-hint" {...register("healthDescription")} />
              <FieldDescription id="health-hint">{p.healthHint}</FieldDescription>
              <FieldError errors={[errors.healthDescription]} />
            </Field>
            {healthDescription.trim().length > 0 && (
              <Field orientation="horizontal" data-invalid={!!errors.consent}>
                <Controller
                  control={control}
                  name="consent"
                  render={({ field }) => (
                    <Checkbox id="consent" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={!!errors.consent} />
                  )}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="consent" className="leading-snug font-normal">
                    {p.consent}
                  </FieldLabel>
                  <FieldError errors={[errors.consent]} />
                </div>
              </Field>
            )}
          </>
        )}
      </FieldGroup>

      <Turnstile ref={turnstile} siteKey={siteKey} onToken={setCaptcha} />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? p.submitting : p.submit}
      </Button>
      <p className="text-center text-xs text-ink-3">{p.privacy}</p>
    </form>
  );
}
