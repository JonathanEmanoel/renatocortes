"use client";

import { useState } from "react";
import { Scissors, ShoppingCart } from "lucide-react";
import { ManualProductSaleForm } from "@/components/internal/manual-product-sale-form";
import { ManualServiceForm } from "@/components/internal/manual-service-form";
import { cn } from "@/utils/cn";

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  visibleInStore: boolean;
};

type BarberOption = {
  id: string;
  name: string;
};

type ActiveTab = "service" | "sale";

export function BarberPanelActionTabs({
  services,
  products,
  barbers,
  barberId
}: {
  services: ServiceOption[];
  products: ProductOption[];
  barbers: BarberOption[];
  barberId: string;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("service");

  const tabs = [
    { id: "service" as const, label: "Atendimento avulso", icon: Scissors },
    { id: "sale" as const, label: "Venda presencial", icon: ShoppingCart }
  ];

  return (
    <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-4 shadow-panel md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">Registro rapido</p>
          <h2 className="mt-1 text-2xl font-black uppercase">Registrar atendimento / venda</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            O responsavel e sempre o barbeiro autenticado. O sistema aplica a regra correta de comissao conforme o tipo de registro.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-black uppercase transition",
                activeTab === tab.id
                  ? "border-primary bg-primary text-black"
                  : "border-primary/30 bg-black/30 text-primary hover:bg-primary hover:text-black"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {activeTab === "service" ? (
          <ManualServiceForm services={services} barbers={barbers} defaultBarberId={barberId} />
        ) : (
          <ManualProductSaleForm products={products} />
        )}
      </div>
    </section>
  );
}
