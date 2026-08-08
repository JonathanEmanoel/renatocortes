"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type AppointmentAction = "approve" | "reject" | "cancel" | "finish";
type AppointmentStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELED" | "COMPLETED" | "NO_SHOW";

const labels: Record<AppointmentAction, string> = {
  approve: "Aprovar",
  reject: "Recusar",
  cancel: "Cancelar",
  finish: "Finalizar"
};

export function AppointmentActionButtons({ appointmentId, status }: { appointmentId: string; status?: AppointmentStatus }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<AppointmentAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const actions = useMemo<AppointmentAction[]>(() => {
    if (status === "PENDING" || !status) return ["approve", "reject"];
    if (status === "CONFIRMED") return ["finish", "cancel"];
    return [];
  }, [status]);

  async function runAction(action: AppointmentAction) {
    const needsConfirmation = action === "reject" || action === "cancel";
    if (needsConfirmation && !window.confirm("Confirmar esta alteracao no agendamento?")) return;

    setLoadingAction(action);
    setFeedback(null);

    try {
      const response = await fetch("/api/internal/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, action })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Nao foi possivel alterar o agendamento.");
        return;
      }

      router.refresh();
    } catch {
      setFeedback("Falha de conexao.");
    } finally {
      setLoadingAction(null);
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action} type="button" size="default" variant={action === "approve" || action === "finish" ? "primary" : "outline"} onClick={() => runAction(action)} disabled={loadingAction !== null}>
            {loadingAction === action ? "Salvando..." : labels[action]}
          </Button>
        ))}
      </div>
      {feedback ? <p className="mt-3 rounded-[8px] border border-primary/50 p-3 text-sm text-primary">{feedback}</p> : null}
    </div>
  );
}
