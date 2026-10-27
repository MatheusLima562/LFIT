"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { messages } from "@/messages/pt-BR";
import { signUp } from "../actions";
import { signUpSchema } from "../schemas";
import { AuthMessage } from "./AuthMessage";

const t = messages.auth.signUp;

export function SignUpForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { organization: "", fullName: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (result && !result.ok) setServerError(result.error);
    });
  });

  const fields = [
    { name: "organization", label: t.organization, autoComplete: "organization" },
    { name: "fullName", label: t.fullName, autoComplete: "name" },
    { name: "email", label: messages.auth.signIn.email, autoComplete: "email", type: "email" },
  ] as const;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && <AuthMessage tone="error">{serverError}</AuthMessage>}
      <FieldGroup>
        {fields.map((f) => (
          <Field key={f.name} data-invalid={!!errors[f.name]}>
            <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
            <Input
              id={f.name}
              type={"type" in f ? f.type : "text"}
              autoComplete={f.autoComplete}
              aria-invalid={!!errors[f.name]}
              {...register(f.name)}
            />
            <FieldError errors={[errors[f.name]]} />
          </Field>
        ))}
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{messages.auth.signIn.password}</FieldLabel>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
