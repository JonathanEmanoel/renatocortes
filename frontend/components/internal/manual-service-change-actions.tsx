"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManualServiceChangeActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<"approve" | "reject" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit(action: "approve" | "reject") {
    setFeedback(null);
    setIsLoading(action);
    try {
      const response = await fetch(`/api/internal/manual-service-change-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel processar.");
        return;
      }
      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button type="button" onClick={() => submit("approve")} disabled={Boolean(isLoading)}>
        <Check className="h-4 w-4" />
        {isLoading === "approve" ? "Aprovando..." : "Aprovar"}
      </Button>
      <button
        type="button"
        onClick={() => submit("reject")}
        disabled={Boolean(isLoading)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-red-400/50 px-4 text-sm font-black uppercase text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
      >
        <X className="h-4 w-4" />
        {isLoading === "reject" ? "Recusando..." : "Recusar e restaurar"}
      </button>
      {feedback ? <p className="basis-full text-sm font-bold text-primary">{feedback}</p> : null}
    </div>
  );
}
