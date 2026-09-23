"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { messages } from "@/messages/pt-BR";
import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema } from "../schemas";
import { AuthMessage } from "./AuthMessage";

const t = messages.auth.forgot;

export function ForgotPasswordForm() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const r = await requestPasswordReset(values);
      setResult(r.ok ? { ok: true, text: r.message ?? t.sent } : { ok: false, text: r.error });
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && <AuthMessage tone={result.ok ? "success" : "error"}>{result.text}</AuthMessage>}
      {!result?.ok && (
        <>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">{messages.auth.signIn.email}</FieldLabel>
            <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? t.submitting : t.submit}
          </Button>
        </>
      )}
      <Link
        href="/entrar"
        className="inline-flex items-center justify-center gap-1.5 rounded text-[13px] font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {t.back}
      </Link>
    </form>
  );
}
