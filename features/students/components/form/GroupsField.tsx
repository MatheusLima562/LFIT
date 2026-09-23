"use client";

import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { searchKey } from "@/lib/text";
import { cn } from "@/lib/utils";
import { messages } from "@/messages/pt-BR";
import { GroupChip } from "@/components/students/GroupChip";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createSpecialGroup } from "../../actions";

const t = messages.studentForm;

export interface GroupOption {
  id: string;
  name: string;
  color: string;
}

interface GroupsFieldProps {
  id: string;
  groups: GroupOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  onGroupCreated: (group: GroupOption) => void;
  describedBy?: string;
}

/** Multi-seleção de grupos especiais com criação inline. */
export function GroupsField({ id, groups, value, onChange, onGroupCreated, describedBy }: GroupsFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = groups.filter((g) => value.includes(g.id));
  const trimmed = search.trim();
  const exists = groups.some((g) => searchKey(g.name) === searchKey(trimmed));

  const toggle = (groupId: string) =>
    onChange(value.includes(groupId) ? value.filter((v) => v !== groupId) : [...value, groupId]);

  const create = () =>
    startTransition(async () => {
      const result = await createSpecialGroup(trimmed);
      if (!result.ok) return void toast.error(result.error);
      onGroupCreated(result.group);
      onChange([...value, result.group.id]);
      setSearch("");
    });

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-describedby={describedBy}
            className="w-full justify-between font-normal text-ink-2"
          >
            {selected.length ? `${selected.length} selecionado(s)` : t.groupsPlaceholder}
            <ChevronsUpDown aria-hidden className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command filter={(itemValue, s) => (searchKey(itemValue).includes(searchKey(s)) ? 1 : 0)}>
            <CommandInput placeholder={t.groupsSearch} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{t.groupsEmpty}</CommandEmpty>
              <CommandGroup>
                {groups.map((g) => (
                  <CommandItem key={g.id} value={g.name} onSelect={() => toggle(g.id)}>
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="flex-1">{g.name}</span>
                    <Check aria-hidden className={cn("size-4", value.includes(g.id) ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
              {trimmed.length >= 2 && !exists && (
                <CommandGroup forceMount>
                  <CommandItem forceMount value={`__criar__${trimmed}`} disabled={pending} onSelect={create}>
                    <Plus aria-hidden />
                    {t.groupsCreate(trimmed)}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t.groups}>
          {selected.map((g) => (
            <li key={g.id} className="flex items-center">
              <GroupChip name={g.name} color={g.color} className="rounded-r-none" />
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-label={`Remover ${g.name}`}
                className="grid h-[22px] w-6 place-items-center rounded-r-md bg-canvas text-ink-3 ring-1 ring-line outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
