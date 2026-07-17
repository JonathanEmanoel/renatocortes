"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, KeyRound, LogOut, Mail, Phone, Star, UserRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClientShell } from "@/components/client/client-shell";
import { SectionTitle } from "@/components/client/section-title";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AddressFields = {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
};

export type ProfileData = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  createdAt: string;
  address: string;
  addressFields: AddressFields;
};

const accountLinks = [
  { href: "/cliente/meus-agendamentos", label: "Meus Agendamentos", icon: CalendarDays },
  { href: "/cliente/assinaturas", label: "Minhas Assinaturas", icon: Star },
  { href: "/", label: "Sair", icon: LogOut }
];

export function ProfileContent({ initialProfile }: { initialProfile: ProfileData }) {
  const [profile, setProfile] = useState(initialProfile);
  const [form, setForm] = useState(initialProfile);
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function updateField(field: keyof ProfileData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAddress(field: keyof AddressFields, value: string) {
    setForm((current) => ({
      ...current,
      addressFields: { ...current.addressFields, [field]: value }
    }));
  }

  async function saveProfile() {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          cpf: form.cpf === "Não informado" ? "" : form.cpf,
          birthDate: form.birthDate === "Não informado" ? "" : form.birthDate,
          address: form.addressFields
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback(payload?.message ?? "Não foi possível alterar seus dados.");
        return;
      }

      const nextProfile = {
        ...form,
        name: payload.name,
        phone: payload.phone ?? "Não informado",
        cpf: payload.cpf,
        birthDate: payload.birthDate,
        address: payload.address
      };

      setProfile(nextProfile);
      setForm(nextProfile);
      setFeedback("Dados atualizados com sucesso.");
      setIsOpen(false);
    } catch {
      setFeedback("Falha de conexão ao atualizar seus dados.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ClientShell>
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">Perfil</p>
      <h1 className="mt-3 text-3xl font-black uppercase md:text-5xl">Meu Perfil</h1>

      <section className="mt-9 rounded-[8px] border border-white/14 bg-card p-6 text-center">
        <Avatar name={profile.name} className="mx-auto h-24 w-24" />
        <h2 className="mt-5 text-2xl font-black uppercase">{profile.name}</h2>
        <div className="mt-6 grid gap-3 text-left md:grid-cols-2">
          <Info icon={Phone} label="Telefone" value={profile.phone} />
          <Info icon={Mail} label="Email" value={profile.email} />
          <Info icon={UserRound} label="CPF" value={profile.cpf} />
          <Info icon={CalendarDays} label="Data de nascimento" value={profile.birthDate} />
          <Info icon={CalendarDays} label="Data de cadastro" value={profile.createdAt} />
          <Info icon={UserRound} label="Endereço" value={profile.address} />
        </div>
        {feedback ? <p className="mt-5 rounded-[8px] border border-primary/50 p-4 text-primary">{feedback}</p> : null}
        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <Button onClick={() => setIsOpen(true)}>
            <UserRound className="h-5 w-5" />
            Editar Dados
          </Button>
          <Button variant="outline">
            <KeyRound className="h-5 w-5" />
            Alterar Senha
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <SectionTitle title="Minha Conta" />
        <div className="grid gap-3">
          {accountLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between rounded-[8px] border border-white/14 bg-card p-5 font-black uppercase transition hover:border-primary/50 hover:text-primary"
            >
              <span className="flex items-center gap-4">
                <item.icon className="h-5 w-5 text-primary" />
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {isOpen ? (
        <ProfileModal
          form={form}
          isSaving={isSaving}
          onClose={() => setIsOpen(false)}
          onSave={saveProfile}
          updateField={updateField}
          updateAddress={updateAddress}
        />
      ) : null}
    </ClientShell>
  );
}

function ProfileModal({
  form,
  isSaving,
  onClose,
  onSave,
  updateField,
  updateAddress
}: {
  form: ProfileData;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  updateField: (field: keyof ProfileData, value: string) => void;
  updateAddress: (field: keyof AddressFields, value: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] grid place-items-end bg-black/78 px-4 py-4 backdrop-blur-sm md:place-items-center">
      <section className="w-full max-w-2xl rounded-[8px] border border-white/16 bg-[#070707] shadow-panel">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Alterar dados</p>
            <h2 className="mt-2 text-xl font-black uppercase">Perfil do cliente</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar edição">
            <X className="h-6 w-6" />
          </Button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome" value={form.name} onChange={(value) => updateField("name", value)} />
            <Field label="Telefone" value={form.phone === "Não informado" ? "" : form.phone} onChange={(value) => updateField("phone", value)} />
            <Field label="CPF" value={form.cpf === "Não informado" ? "" : form.cpf} onChange={(value) => updateField("cpf", value)} />
            <Field label="Data de nascimento" value={form.birthDate === "Não informado" ? "" : form.birthDate} onChange={(value) => updateField("birthDate", value)} placeholder="DD/MM/AAAA" />
            <Field label="Rua" value={form.addressFields.street} onChange={(value) => updateAddress("street", value)} />
            <Field label="Número" value={form.addressFields.number} onChange={(value) => updateAddress("number", value)} />
            <Field label="Complemento" value={form.addressFields.complement} onChange={(value) => updateAddress("complement", value)} />
            <Field label="Bairro" value={form.addressFields.neighborhood} onChange={(value) => updateAddress("neighborhood", value)} />
            <Field label="Cidade" value={form.addressFields.city} onChange={(value) => updateAddress("city", value)} />
            <Field label="UF" value={form.addressFields.state} onChange={(value) => updateAddress("state", value)} maxLength={2} />
            <div className="md:col-span-2">
              <Field label="CEP" value={form.addressFields.zipCode} onChange={(value) => updateAddress("zipCode", value)} />
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} />
    </label>
  );
}

function Info({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/35 p-4">
      <p className="flex items-center gap-3 text-sm uppercase tracking-[0.08em] text-white/50">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}
