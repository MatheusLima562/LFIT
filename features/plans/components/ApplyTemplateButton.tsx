"use client";

import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";
import { ApplyTemplateDialog, type Option } from "./ApplyTemplateDialog";

export function ApplyTemplateButton({ student, templates }: { student: Option; templates: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LayoutTemplate aria-hidden />
        {messages.plans.manage.applyTemplate}
      </Button>
      {open && <ApplyTemplateDialog fixed={{ kind: "student", ...student }} options={templates} onClose={() => setOpen(false)} />}
    </>
  );
}
