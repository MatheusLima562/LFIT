"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { messages } from "@/messages/pt-BR";
import { setNewPassword } from "../actions";
import { newPasswordSchema } from "../schemas";
import { AuthMessage } from "./AuthMessage";

const t = messages.auth.newPassword;

export function NewPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await setNewPassword(values);
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && <AuthMessage tone="error">{serverError}</AuthMessage>}
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{t.password}</FieldLabel>
          <PasswordInput id="password" autoComplete="new-password" autoFocus aria-invalid={!!errors.password} {...register("password")} />
          <FieldDescription>{messages.validation.passwordMin}</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirm}>
          <FieldLabel htmlFor="confirm">{t.confirm}</FieldLabel>
          <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
          <FieldError errors={[errors.confirm]} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
