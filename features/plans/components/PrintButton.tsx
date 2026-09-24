"use client";

import { Printer } from "lucide-react";
import { messages } from "@/messages/pt-BR";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden />
      {messages.plans.print.button}
    </Button>
  );
}
