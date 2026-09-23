import { z } from "zod";
import { messages } from "@/messages/pt-BR";

const v = messages.validation;

const email = z.string().trim().toLowerCase().min(1, v.required).pipe(z.email(v.email));
/** Mínimo alinhado ao Supabase Auth (Authentication → Email → Minimum password length = 10). */
export const PASSWORD_MIN_LENGTH = 10;
const newPassword = z.string().min(PASSWORD_MIN_LENGTH, v.passwordMin).max(72, v.passwordMax);

export const signInSchema = z.object({
  email,
  password: z.string().min(1, v.required),
});

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string().min(1, v.required) })
  .refine((d) => d.password === d.confirm, { message: v.passwordMismatch, path: ["confirm"] });

export const signUpSchema = z.object({
  organization: z.string().trim().min(2, v.required).max(120),
  fullName: z.string().trim().min(2, v.required).max(120),
  email,
  password: newPassword,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Resultado padrão das server actions de formulário. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Só aceita caminhos internos (evita open redirect via ?next=). */
export function safeNext(next: unknown, fallback = "/") {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
