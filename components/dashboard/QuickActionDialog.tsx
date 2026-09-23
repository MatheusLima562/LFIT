"use client";

import type { FormEvent } from "react";
import type { QuickAction } from "@/types/dashboard";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/Dialog";

interface QuickActionDialogProps {
  action: QuickAction | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const fieldClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-line-strong focus:border-brand-300 focus:ring-3 focus:ring-brand-500/15";

export function QuickActionDialog({ action, onClose, onDone }: QuickActionDialogProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!action) return;
    // Sem backend nesta etapa: apenas confirma a ação.
    onDone(action.successMessage);
  };

  return (
    <Dialog open={action !== null} onClose={onClose} title={action?.label ?? ""} description={action?.description}>
      {action && (
        <form key={action.id} onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          {action.fields.map((field) => {
            const id = `qa-${action.id}-${field.name}`;
            return (
              <div key={field.name} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-[13px] font-medium text-ink">
                  {field.label}
                  {field.required && <span className="text-brand-600"> *</span>}
                </label>
                {field.type === "select" ? (
                  <select id={id} name={field.name} className={fieldClass} defaultValue={field.options?.[0]}>
                    {field.options?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    name={field.name}
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    className={fieldClass}
                  />
                )}
              </div>
            );
          })}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>
              Cancelar
            </button>
            <button type="submit" className={buttonClass("primary")}>
              {action.submitLabel}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
