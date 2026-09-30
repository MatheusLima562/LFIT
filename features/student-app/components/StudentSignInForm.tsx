"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthMessage } from "@/features/auth/components/AuthMessage";
import { signInSchema } from "@/features/auth/schemas";
import { messages } from "@/messages/pt-BR";
import { signInStudent } from "../actions";

const t = messages.auth.signIn;

export function StudentSignInForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signInStudent(values);
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && <AuthMessage tone="error">{serverError}</AuthMessage>}
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">{t.email}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">{t.password}</FieldLabel>
            <Link href="/esqueci-senha" className="rounded text-[13px] link outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              {t.forgot}
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending} className="h-12 w-full text-base">
        {pending ? t.submitting : t.submit}
      </Button>
      <p className="text-center text-xs text-ink-3">{messages.aluno.signIn.noAccount}</p>
    </form>
  );
}
