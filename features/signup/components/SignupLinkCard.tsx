"use client";

import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { regenerateSignupToken, setSignupLinkActive, updateSignupFields } from "../actions";
import { SIGNUP_FIELDS, type FieldMode, type SignupConfig } from "../schemas";

const a = messages.signup.admin;

interface SignupLinkCardProps {
  siteUrl: string;
  token: string;
  isActive: boolean;
  config: SignupConfig;
}

export function SignupLinkCard({ siteUrl, token, isActive, config }: SignupLinkCardProps) {
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<SignupConfig>(config);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const url = `${siteUrl}/cadastro/${token}`;
  const dirty = SIGNUP_FIELDS.some((f) => fields[f] !== config[f]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <section aria-labelledby="signup-link-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="signup-link-title" className="text-[15px] font-semibold text-ink">{a.linkTitle}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">{a.activeHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="link-active" className="text-[13px]">{a.active}</Label>
          <Switch id="link-active" checked={isActive} disabled={pending} onCheckedChange={(v) => run(() => setSignupLinkActive(v))} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={url} aria-label="URL do link de cadastro" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success(a.copied);
              } catch {
                toast.message(url);
              }
            }}
          >
            <Copy aria-hidden />
            {a.copy}
          </Button>
          <Button asChild variant="outline" size="icon" aria-label={a.open}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
            </a>
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setConfirmRegenerate(true)}>
            <RefreshCw aria-hidden />
            <span className="hidden sm:inline">{a.regenerate}</span>
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-[13px] font-semibold text-ink">{a.fieldsTitle}</h3>
        <p className="mt-0.5 text-xs text-ink-3">{a.fieldsHint}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SIGNUP_FIELDS.map((field) => (
            <div key={field} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <Label htmlFor={`field-${field}`} className="font-normal">{messages.signup.fieldLabels[field]}</Label>
              <Select value={fields[field]} onValueChange={(v) => setFields((prev) => ({ ...prev, [field]: v as FieldMode }))}>
                <SelectTrigger id={`field-${field}`} size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["hidden", "optional", "required"] as const).map((m) => (
                    <SelectItem key={m} value={m}>{messages.signup.modes[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <Button className="mt-3" variant="outline" disabled={!dirty || pending} onClick={() => run(() => updateSignupFields(fields))}>
          {a.saveFields}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={a.regenerateTitle}
        description={a.regenerateText}
        confirmLabel={a.regenerate}
        cancelLabel={messages.students.confirm.cancel}
        destructive
        pending={pending}
        onConfirm={() => {
          setConfirmRegenerate(false);
          run(regenerateSignupToken);
        }}
      />
    </section>
  );
}
