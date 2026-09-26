"use client";

import { useEffect, useMemo, useState } from "react";

export function useClientSlots(query: string | null) {
  const [result, setResult] = useState<{ query: string; times: string[]; message: string } | null>(null);
  useEffect(() => {
    if (!query) return;
    let active = true;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    async function refresh() {
      window.clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const requestController = controller;
      const started = performance.now();
      setResult(null);
      try {
        const response = await fetch(`/api/appointments?${query}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (active && !requestController.signal.aborted) {
          const remaining = Math.max(0, (payload.validForMs ?? 15000) - (performance.now() - started));
          setResult({ query: query!, times: response.ok && remaining > 0 ? payload.times ?? [] : [], message: payload.message ?? "Nao foi possivel consultar horarios." });
          timer = window.setTimeout(() => void refresh(), Math.max(100, Math.min(15000, remaining)));
        }
      } catch (error) {
        if (active && !requestController.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setResult({ query: query!, times: [], message: "Nao foi possivel consultar horarios. Tente novamente." });
      }
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { active = false; controller?.abort(); window.clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [query]);
  const times = useMemo(() => result?.query === query ? result?.times ?? [] : [], [result, query]);
  return { times, loading: Boolean(query && result?.query !== query), message: result?.query === query ? result?.message ?? "" : query ? "Consultando horarios..." : "Selecione os servicos para consultar horarios." };
}
