"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarClock, Package, Scissors, Star, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type CategoryOption = {
  id: string;
  name: string;
};

type ProductItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  stock: number;
  image: string;
  active: boolean;
  visibleInStore: boolean;
};

type ServiceItem = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  active: boolean;
};

type PlanItem = {
  id: string;
  name: string;
  description: string;
  value: number;
  benefits: string;
  cutsIncluded: number;
  periodDays: number;
  active: boolean;
};

type BarberItem = {
  id: string;
  name: string;
  email: string;
  specialty: string;
  photo: string;
  active: boolean;
  serviceCommissionPercent: number;
  productCommissionPercent: number;
  startTime: string;
  endTime: string;
};

type AdminCrudPanelProps = {
  categories: CategoryOption[];
  products: ProductItem[];
  services: ServiceItem[];
  plans: PlanItem[];
  barbers: BarberItem[];
};

type Tab = "products" | "services" | "plans" | "barbers";

const emptyProduct = {
  productId: "",
  categoryId: "",
  name: "",
  description: "",
  price: 0,
  costPrice: 0,
  stock: 0,
  image: "",
  active: true,
  visibleInStore: true
};

const emptyService = {
  serviceId: "",
  name: "",
  description: "",
  duration: 30,
  price: 0,
  active: true
};

const emptyPlan = {
  planId: "",
  name: "",
  description: "",
  value: 0,
  benefits: "",
  cutsIncluded: 0,
  periodDays: 30,
  active: true
};

const emptyBarber = {
  barberId: "",
  specialty: "",
  photo: "",
  active: true,
  serviceCommissionPercent: 50,
  productCommissionPercent: 20,
  startTime: "09:00",
  endTime: "18:00"
};

function parseNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold uppercase tracking-[0.08em] text-white/70">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "min-h-12 rounded-[10px] border border-primary/20 bg-black/45 px-4 text-base font-semibold text-white outline-none transition focus:border-primary";

export function AdminCrudPanel({ categories, products, services, plans, barbers }: AdminCrudPanelProps) {
  const [tab, setTab] = useState<Tab>("products");
  const [message, setMessage] = useState("");
  const [productForm, setProductForm] = useState({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [barberForm, setBarberForm] = useState(emptyBarber);

  const currentBarber = useMemo(() => barbers.find((barber) => barber.id === barberForm.barberId), [barberForm.barberId, barbers]);

  async function requestJson(url: string, method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setMessage("");
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir a ação.");
    setMessage("Alteração salva com sucesso.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  function selectProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return setProductForm({ ...emptyProduct, categoryId: categories[0]?.id ?? "" });
    setProductForm({ ...product, productId: product.id });
  }

  function selectService(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return setServiceForm(emptyService);
    setServiceForm({ ...service, serviceId: service.id });
  }

  function selectPlan(id: string) {
    const plan = plans.find((item) => item.id === id);
    if (!plan) return setPlanForm(emptyPlan);
    setPlanForm({ ...plan, planId: plan.id });
  }

  function selectBarber(id: string) {
    const barber = barbers.find((item) => item.id === id);
    if (!barber) return setBarberForm(emptyBarber);
    setBarberForm({
      barberId: barber.id,
      specialty: barber.specialty,
      photo: barber.photo,
      active: barber.active,
      serviceCommissionPercent: barber.serviceCommissionPercent,
      productCommissionPercent: barber.productCommissionPercent,
      startTime: barber.startTime,
      endTime: barber.endTime
    });
  }

  async function saveProduct() {
    const payload = { ...productForm };
    await requestJson("/api/internal/products", payload.productId ? "PATCH" : "POST", payload);
  }

  async function saveService() {
    const payload = { ...serviceForm };
    await requestJson("/api/internal/services", payload.serviceId ? "PATCH" : "POST", payload);
  }

  async function savePlan() {
    const payload = { ...planForm };
    await requestJson("/api/internal/plans", payload.planId ? "PATCH" : "POST", payload);
  }

  async function saveBarber() {
    if (!barberForm.barberId) {
      setMessage("Selecione um barbeiro já cadastrado no Auth.");
      return;
    }
    await requestJson("/api/internal/barbers", "PATCH", barberForm);
  }

  return (
    <section className="mt-8 rounded-[12px] border border-primary/20 bg-card p-6 shadow-panel">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Gestão operacional</p>
          <h2 className="mt-2 text-2xl font-black uppercase">Cadastros e configurações</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {[
            { id: "products" as const, label: "Produtos", icon: Package },
            { id: "services" as const, label: "Serviços", icon: Scissors },
            { id: "plans" as const, label: "Planos", icon: Star },
            { id: "barbers" as const, label: "Barbeiros", icon: UserCog }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-[10px] border px-4 py-3 text-sm font-black uppercase transition ${
                tab === item.id ? "border-primary bg-primary text-black" : "border-white/10 bg-black/30 text-white/70"
              }`}
            >
              <item.icon className="mr-2 inline h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {message ? <div className="mt-5 rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{message}</div> : null}

      {tab === "products" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <div className="rounded-[10px] border border-white/10 bg-black/30 p-4">
            <select className={inputClass} onChange={(event) => selectProduct(event.target.value)} value={productForm.productId}>
              <option value="">Novo produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <div className="mt-4 grid gap-3">
              {products.slice(0, 8).map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-[8px] border border-white/10 bg-black/30 px-3 py-2 text-sm">
                  <span>{product.name}</span>
                  <strong className="text-primary">{formatCurrency(product.price)}</strong>
                </div>
              ))}
            </div>
          </div>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void saveProduct(); }}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome"><input className={inputClass} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
              <Field label="Categoria">
                <select className={inputClass} value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Preço venda"><input className={inputClass} value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: parseNumber(event.target.value) })} /></Field>
              <Field label="Preço custo"><input className={inputClass} value={productForm.costPrice} onChange={(event) => setProductForm({ ...productForm, costPrice: parseNumber(event.target.value) })} /></Field>
              <Field label="Estoque"><input className={inputClass} type="number" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: Number(event.target.value) })} /></Field>
              <Field label="Imagem"><input className={inputClass} value={productForm.image} onChange={(event) => setProductForm({ ...productForm, image: event.target.value })} /></Field>
            </div>
            <Field label="Descrição"><textarea className={`${inputClass} min-h-28 py-3`} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></Field>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm({ ...productForm, active: event.target.checked })} /> Produto ativo</label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="bg-primary text-black hover:bg-primary/90">Salvar produto</Button>
              {productForm.productId ? <Button type="button" variant="outline" onClick={() => void requestJson("/api/internal/products", "DELETE", { productId: productForm.productId })}>Desativar</Button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {tab === "services" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <select className={inputClass} onChange={(event) => selectService(event.target.value)} value={serviceForm.serviceId}>
            <option value="">Novo serviço</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void saveService(); }}>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nome"><input className={inputClass} value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></Field>
              <Field label="Duração"><input className={inputClass} type="number" value={serviceForm.duration} onChange={(event) => setServiceForm({ ...serviceForm, duration: Number(event.target.value) })} /></Field>
              <Field label="Preço"><input className={inputClass} value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: parseNumber(event.target.value) })} /></Field>
            </div>
            <Field label="Descrição"><textarea className={`${inputClass} min-h-28 py-3`} value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} /></Field>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={serviceForm.active} onChange={(event) => setServiceForm({ ...serviceForm, active: event.target.checked })} /> Serviço ativo</label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="bg-primary text-black hover:bg-primary/90">Salvar serviço</Button>
              {serviceForm.serviceId ? <Button type="button" variant="outline" onClick={() => void requestJson("/api/internal/services", "DELETE", { serviceId: serviceForm.serviceId })}>Desativar</Button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {tab === "plans" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <select className={inputClass} onChange={(event) => selectPlan(event.target.value)} value={planForm.planId}>
            <option value="">Novo plano</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void savePlan(); }}>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nome"><input className={inputClass} value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} /></Field>
              <Field label="Valor"><input className={inputClass} value={planForm.value} onChange={(event) => setPlanForm({ ...planForm, value: parseNumber(event.target.value) })} /></Field>
              <Field label="Cortes"><input className={inputClass} type="number" value={planForm.cutsIncluded} onChange={(event) => setPlanForm({ ...planForm, cutsIncluded: Number(event.target.value) })} /></Field>
            </div>
            <Field label="Benefícios"><textarea className={`${inputClass} min-h-28 py-3`} value={planForm.benefits} onChange={(event) => setPlanForm({ ...planForm, benefits: event.target.value })} /></Field>
            <Field label="Descrição"><textarea className={`${inputClass} min-h-24 py-3`} value={planForm.description} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} /></Field>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={planForm.active} onChange={(event) => setPlanForm({ ...planForm, active: event.target.checked })} /> Plano ativo</label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="bg-primary text-black hover:bg-primary/90">Salvar plano</Button>
              {planForm.planId ? <Button type="button" variant="outline" onClick={() => void requestJson("/api/internal/plans", "DELETE", { planId: planForm.planId })}>Desativar</Button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {tab === "barbers" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <div className="grid gap-4">
            <select className={inputClass} onChange={(event) => selectBarber(event.target.value)} value={barberForm.barberId}>
              <option value="">Selecione um barbeiro</option>
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select>
            {currentBarber ? (
              <div className="rounded-[10px] border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                <p className="font-black uppercase text-white">{currentBarber.name}</p>
                <p>{currentBarber.email}</p>
              </div>
            ) : (
              <div className="rounded-[10px] border border-primary/20 bg-primary/10 p-4 text-sm font-semibold text-primary">
                A conta do barbeiro deve existir no Supabase Auth. Aqui são alterados apenas dados operacionais.
              </div>
            )}
          </div>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void saveBarber(); }}>
            <Field label="Especialidade"><input className={inputClass} value={barberForm.specialty} onChange={(event) => setBarberForm({ ...barberForm, specialty: event.target.value })} /></Field>
            <Field label="Foto"><input className={inputClass} value={barberForm.photo} onChange={(event) => setBarberForm({ ...barberForm, photo: event.target.value })} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Comissão serviço %"><input className={inputClass} value={barberForm.serviceCommissionPercent} onChange={(event) => setBarberForm({ ...barberForm, serviceCommissionPercent: parseNumber(event.target.value) })} /></Field>
              <Field label="Comissão produto %"><input className={inputClass} value={barberForm.productCommissionPercent} onChange={(event) => setBarberForm({ ...barberForm, productCommissionPercent: parseNumber(event.target.value) })} /></Field>
              <Field label="Início"><input className={inputClass} type="time" value={barberForm.startTime} onChange={(event) => setBarberForm({ ...barberForm, startTime: event.target.value })} /></Field>
              <Field label="Fim"><input className={inputClass} type="time" value={barberForm.endTime} onChange={(event) => setBarberForm({ ...barberForm, endTime: event.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-3 font-bold uppercase text-white/70"><input type="checkbox" checked={barberForm.active} onChange={(event) => setBarberForm({ ...barberForm, active: event.target.checked })} /> Barbeiro ativo para agenda</label>
            <Button type="submit" className="bg-primary text-black hover:bg-primary/90">
              <CalendarClock className="mr-2 h-4 w-4" />
              Salvar barbeiro
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
