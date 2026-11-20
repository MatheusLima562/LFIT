"use client";

import { useRouter } from "next/navigation";
import { Download, ImagePlus, TriangleAlert } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/db/client";
import { resizeImage } from "@/lib/image-resize";
import { formatPhoneDisplay, isValidPhone, toE164 } from "@/lib/phone";
import { uuidV4 } from "@/lib/uuid";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { BRANDING_BUCKET, BRANDING_MAX_BYTES, BRANDING_MAX_DIM, TIME_ZONES, brandingPath, type ExportKind } from "../settings";

const t = messages.settings;
const box = "flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-line";
const label = "text-sm font-medium text-ink";

/** Envia uma imagem reduzida ao bucket `org-branding`; devolve o caminho e uma prévia local. Apaga o envio anterior não salvo. */
function useBrandingUpload(path: (fileId: string, mime: "image/webp" | "image/jpeg") => string) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const pending = useRef<string | null>(null);
  const upload = async (file: File | undefined): Promise<{ path: string; preview: string } | null> => {
    if (!file) return null;
    setBusy(true);
    try {
      const r = await resizeImage(file, { maxDim: BRANDING_MAX_DIM, maxBytes: BRANDING_MAX_BYTES });
      if ("error" in r) {
        toast.error(r.error === "too_big" ? t.image.tooBig : t.image.invalid);
        return null;
      }
      const p = path(uuidV4(), r.mime);
      const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(p, r.blob, { contentType: r.mime, upsert: false });
      if (error) {
        toast.error(t.image.failed);
        return null;
      }
      if (pending.current) void supabase.storage.from(BRANDING_BUCKET).remove([pending.current]);
      pending.current = p;
      return { path: p, preview: URL.createObjectURL(r.blob) };
    } catch {
      toast.error(t.image.failed);
      return null;
    } finally {
      setBusy(false);
    }
  };
  /** Salvou: o envio deixa de ser pendente; a imagem anterior (substituída) é apagada. */
  const committed = (previous: string | null) => {
    pending.current = null;
    if (previous) void supabase.storage.from(BRANDING_BUCKET).remove([previous]);
  };
  return { supabase, busy, upload, committed };
}

function ImagePicker({ id, label: text, preview, busy, onPick, onRemove, choose, remove, round }: {
  id: string; label: string; preview: string | null; busy: boolean; onPick: (f: File | undefined) => void; onRemove: () => void;
  choose: string; remove: string; round?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={label}>{text}</span>
      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada / prévia local (fora do otimizador)
          <img src={preview} alt={t.image.alt(text)} className={`size-16 bg-canvas object-cover ring-1 ring-line ${round ? "rounded-full" : "rounded-xl"}`} />
        ) : (
          <span aria-hidden className={`grid size-16 place-items-center bg-canvas text-ink-3 ring-1 ring-line ${round ? "rounded-full" : "rounded-xl"}`}>
            <ImagePlus className="size-5" />
          </span>
        )}
        <input ref={ref} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? t.image.uploading : choose}
        </Button>
        {preview && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove}>{remove}</Button>
        )}
      </div>
    </div>
  );
}

export function ProfileForm({ orgId, userId, initial }: { orgId: string; userId: string; initial: { fullName: string; avatarPath: string | null; avatarUrl: string | null } }) {
  const id = useId();
  const router = useRouter();
  const img = useBrandingUpload((fileId, mime) => brandingPath(orgId, "avatar", fileId, mime, userId));
  const [name, setName] = useState(initial.fullName);
  const [avatar, setAvatar] = useState({ path: initial.avatarPath, preview: initial.avatarUrl });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await img.supabase.rpc("update_my_profile", { p_full_name: name, p_avatar_path: avatar.path ?? "" });
      if (error) return void toast.error(dbErrorMessage(error));
      img.committed((data as { previous_avatar_path?: string | null } | null)?.previous_avatar_path ?? null);
      toast.success(t.profile.saved);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className={box}>
      <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.profile.title}</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-n`} className={label}>{t.profile.name}</label>
        <Input id={`${id}-n`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <ImagePicker id={`${id}-p`} label={t.profile.photo} preview={avatar.preview} busy={img.busy} round choose={t.profile.choosePhoto} remove={t.profile.removePhoto}
        onPick={async (f) => { const r = await img.upload(f); if (r) setAvatar(r); }} onRemove={() => setAvatar({ path: null, preview: null })} />
      <Button type="button" className="self-start" disabled={saving || img.busy || name.trim().length < 2} onClick={() => void save()}>{t.profile.save}</Button>
    </section>
  );
}

export function BusinessForm({ orgId, initial }: { orgId: string; initial: { name: string; logoPath: string | null; logoUrl: string | null; contactWhatsapp: string | null } }) {
  const id = useId();
  const router = useRouter();
  const img = useBrandingUpload((fileId, mime) => brandingPath(orgId, "logo", fileId, mime));
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.contactWhatsapp ? formatPhoneDisplay(initial.contactWhatsapp) : "");
  const [logo, setLogo] = useState({ path: initial.logoPath, preview: initial.logoUrl });
  const [saving, setSaving] = useState(false);
  const phoneOk = phone.trim() === "" || isValidPhone(phone, "BR");

  const save = async () => {
    setSaving(true);
    try {
      const e164 = phone.trim() ? toE164(phone, "BR") : "";
      const { data, error } = await img.supabase.rpc("update_organization_profile", { p_name: name, p_logo_path: logo.path ?? "", p_contact_whatsapp: e164 ?? "" });
      if (error) return void toast.error(dbErrorMessage(error));
      img.committed((data as { previous_logo_path?: string | null } | null)?.previous_logo_path ?? null);
      toast.success(t.business.saved);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className={box}>
      <div>
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.business.title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.business.hint}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-n`} className={label}>{t.business.name}</label>
        <Input id={`${id}-n`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <ImagePicker id={`${id}-l`} label={t.business.logo} preview={logo.preview} busy={img.busy} choose={t.business.chooseLogo} remove={t.business.removeLogo}
        onPick={async (f) => { const r = await img.upload(f); if (r) setLogo(r); }} onRemove={() => setLogo({ path: null, preview: null })} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-w`} className={label}>{t.business.whatsapp}</label>
        <Input id={`${id}-w`} type="tel" inputMode="tel" value={phone} aria-invalid={!phoneOk || undefined} aria-describedby={`${id}-wh`} onChange={(e) => setPhone(e.target.value)} className="sm:max-w-64" />
        <p id={`${id}-wh`} className={`text-xs ${phoneOk ? "text-ink-3" : "text-danger-ink"}`}>{phoneOk ? t.business.whatsappHint : t.business.whatsappInvalid}</p>
      </div>
      <Button type="button" className="self-start" disabled={saving || img.busy || name.trim().length < 2 || !phoneOk} onClick={() => void save()}>{t.business.save}</Button>
    </section>
  );
}

/** Fuso da conta (só o personal). Lista fixa, igual à do banco (`private.allowed_time_zones`). */
export function TimeZoneForm({ initial }: { initial: string }) {
  const id = useId();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tz, setTz] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_organization_time_zone", { p_time_zone: tz });
      if (error) return void toast.error(dbErrorMessage(error));
      toast.success(t.timeZone.saved);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-t`} className={box}>
      <div>
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.timeZone.title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.timeZone.hint}</p>
      </div>
      <label htmlFor={`${id}-z`} className={label}>{t.timeZone.label}</label>
      <select id={`${id}-z`} value={tz} onChange={(e) => setTz(e.target.value)}
        className="h-10 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm">
        {TIME_ZONES.map((z) => <option key={z} value={z}>{t.timeZone.zones[z] ?? z}</option>)}
      </select>
      <Button type="button" className="self-start" disabled={saving || tz === initial} onClick={() => void save()}>{t.timeZone.save}</Button>
    </section>
  );
}

export function PasswordForm() {
  const id = useId();
  const supabase = useMemo(() => createClient(), []);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const problem = pw.length > 0 && pw.length < 10 ? t.password.tooShort : confirm.length > 0 && pw !== confirm ? t.password.mismatch : null;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) return void toast.error(t.password.failed);
      setPw("");
      setConfirm("");
      toast.success(t.password.saved);
    } catch {
      toast.error(t.password.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className={box}>
      <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.password.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-a`} className={label}>{t.password.new}</label>
          <PasswordInput id={`${id}-a`} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-b`} className={label}>{t.password.confirm}</label>
          <PasswordInput id={`${id}-b`} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      {problem && <p className="text-xs text-danger-ink">{problem}</p>}
      <Button type="button" className="self-start" disabled={saving || pw.length < 10 || pw !== confirm} onClick={() => void save()}>{t.password.save}</Button>
    </section>
  );
}

/** Exportação (só o personal). Saúde só com a caixa marcada e confirmação. Download pela rota (CSV com defesa contra fórmula). */
export function ExportPanel() {
  const id = useId();
  const [health, setHealth] = useState(false);
  const [confirming, setConfirming] = useState<ExportKind | null>(null);
  // Download pela rota (anexo CSV): um link temporário com `download` não sai da página.
  const go = (kind: ExportKind) => {
    const a = document.createElement("a");
    a.href = `/configuracoes/exportar?tipo=${kind}${health ? "&saude=1" : ""}`;
    a.download = "";
    a.click();
  };
  const click = (kind: ExportKind) => (health ? setConfirming(kind) : go(kind));

  return (
    <section aria-labelledby={`${id}-t`} className={box}>
      <div>
        <h2 id={`${id}-t`} className="text-[15px] font-semibold text-ink">{t.export.title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.export.hint}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} className="size-4 accent-[var(--color-control)]" />
        {t.export.health}
      </label>
      {health && (
        <p role="note" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-ink ring-1 ring-warning-line">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.export.healthWarning}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => click("students")}><Download aria-hidden />{t.export.students}</Button>
        <Button type="button" variant="outline" onClick={() => click("sessions")}><Download aria-hidden />{t.export.sessions}</Button>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={t.export.confirmTitle}
        description={t.export.healthWarning}
        confirmLabel={t.export.confirm}
        onConfirm={() => { const k = confirming; setConfirming(null); if (k) go(k); }}
      />
    </section>
  );
}
