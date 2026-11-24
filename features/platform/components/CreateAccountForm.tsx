"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/action";
import { messages } from "@/messages/pt-BR";
import { createPersonalAccount } from "../actions";
import { PLANS, type Plan } from "../platform";
import { InviteLinkPanel } from "./InviteLinkPanel";

const t = messages.platform;
const field = "flex flex-col gap-1.5";
const label = "text-sm font-medium text-ink";
const select = "h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CreateAccountForm() {
  const id = useId();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ url: string; name: string; orgId?: string } | null>(null);
  const [form, setForm] = useState({ business: "", owner: "", email: "", plan: "pro" as Plan, limit: "50" });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await callAction(() => createPersonalAccount({ ...form, limit: Number(form.limit) }));
      if (!r) return;
      if (!r.ok) return void toast.error(r.error);
      toast.success(t.create.created);
      setCreated({ url: r.url, name: form.owner.split(" ")[0] ?? "", orgId: r.orgId });
    });
  };

  if (created) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-ink-2">{t.create.created}</p>
        <InviteLinkPanel url={created.url} name={created.name} />
        {created.orgId && (
          <Link href={`/plataforma/contas/${created.orgId}`} className="link self-start text-sm">
            {form.business}
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <p className="text-sm text-ink-2">{t.create.hint}</p>
      <div className={field}>
        <label htmlFor={`${id}-b`} className={label}>{t.create.business}</label>
        <Input id={`${id}-b`} required minLength={2} maxLength={120} value={form.business} onChange={set("business")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-o`} className={label}>{t.create.owner}</label>
        <Input id={`${id}-o`} required minLength={2} maxLength={120} value={form.owner} onChange={set("owner")} />
      </div>
      <div className={field}>
        <label htmlFor={`${id}-e`} className={label}>{t.create.email}</label>
        <Input id={`${id}-e`} type="email" required value={form.email} onChange={set("email")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${id}-p`} className={label}>{t.create.plan}</label>
          <select id={`${id}-p`} value={form.plan} onChange={set("plan")} className={select}>
            {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
          </select>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-l`} className={label}>{t.create.limit}</label>
          <Input id={`${id}-l`} type="number" min={1} max={100000} required value={form.limit} onChange={set("limit")} />
        </div>
      </div>
      <Button type="submit" className="self-start" disabled={pending}>{pending ? t.create.submitting : t.create.submit}</Button>
    </form>
  );
}
