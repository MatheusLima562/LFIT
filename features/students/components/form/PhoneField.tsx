"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPhoneAsYouType, isCountryCode, phoneCountries } from "@/lib/phone";
import { searchKey } from "@/lib/text";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

interface PhoneFieldProps {
  id: string;
  country: string;
  value: string;
  onCountryChange: (country: string) => void;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}

/** WhatsApp: seletor de país (padrão +55) + número com máscara do país. Salvo em E.164. */
export function PhoneField({ id, country, value, onCountryChange, onChange, onBlur, invalid }: PhoneFieldProps) {
  const [open, setOpen] = useState(false);
  const current = useMemo(() => phoneCountries.find((c) => c.code === country) ?? phoneCountries[0], [country]);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`${messages.studentForm.country}: ${current.name} (${current.dial})`}
            className="w-28 shrink-0 justify-between px-2.5"
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden>{flag(current.code)}</span>
              <span className="tabular text-[13px]">{current.dial}</span>
            </span>
            <ChevronsUpDown aria-hidden className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command filter={(itemValue, search) => (searchKey(itemValue).includes(searchKey(search)) ? 1 : 0)}>
            <CommandInput placeholder="Buscar país ou DDI" />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
              {phoneCountries.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.dial} ${c.code}`}
                  onSelect={() => {
                    if (isCountryCode(c.code)) onCountryChange(c.code);
                    if (value) onChange(formatPhoneAsYouType(value.replace(/\D/g, ""), c.code));
                    setOpen(false);
                  }}
                >
                  <span aria-hidden>{flag(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="tabular text-xs text-ink-3">{c.dial}</span>
                  <Check aria-hidden className={cn("size-4", c.code === current.code ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={current.code === "BR" ? "(41) 99999-0000" : ""}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          // Ao apagar, não reaplica a máscara (senão o backspace "trava" em ")" ou "-").
          const deleting = next.length < value.length;
          onChange(deleting || !isCountryCode(current.code) ? next : formatPhoneAsYouType(next, current.code));
        }}
        onBlur={onBlur}
        aria-invalid={invalid}
      />
    </div>
  );
}
