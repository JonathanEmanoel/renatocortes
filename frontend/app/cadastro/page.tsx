"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

const registerSchema = z
  .object({
    name: z.string().min(3, "Informe seu nome completo."),
    phone: z.string().min(10, "Informe um telefone válido."),
    email: z.string().email("Informe um e-mail válido."),
    password: z.string().min(6, "Use no mínimo 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirme sua senha.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmPassword"]
  });

type RegisterFormData = z.infer<typeof registerSchema>;
type LegalDocument = "terms" | "privacy" | null;

function getConfirmationRedirectUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return undefined;
  }

  return `${window.location.origin}/auth/redirect`;
}

function getFriendlySignUpError(error: { message: string; status?: number; name?: string; code?: string }) {
  const { message, status, name, code } = error;
  const normalized = message.toLowerCase();

  if (
    status === 500 ||
    normalized === "{}" ||
    normalized.includes("confirmation email") ||
    normalized.includes("unexpected_failure") ||
    name === "AuthRetryableFetchError" ||
    code === "unexpected_failure"
  ) {
    return {
      field: null,
      message:
        "Sua conta não pôde ser criada porque o Supabase não conseguiu enviar o e-mail de confirmação agora. Avise a barbearia para verificar o envio de e-mails e tente novamente."
    };
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return {
      field: "email" as const,
      message: "Conta já existente, informe outro e-mail ou redefina a senha."
    };
  }

  if (normalized.includes("password")) {
    return {
      field: "password" as const,
      message: "Essa senha não foi aceita. Use pelo menos 6 caracteres e misture letras com números. Se possível, inclua um caractere especial."
    };
  }

  if (normalized.includes("redirect") || normalized.includes("url")) {
    return {
      field: null,
      message: "Não foi possível enviar o e-mail de confirmação porque a URL de retorno não está liberada no Supabase. Avise a barbearia ou tente novamente."
    };
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return {
      field: null,
      message: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."
    };
  }

  return {
    field: null,
    message: "Não foi possível criar sua conta agora. Verifique os dados e tente novamente."
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema)
  });

  async function onSubmit(data: RegisterFormData) {
    setFormError(null);
    const supabase = createClient();
    const confirmationRedirectUrl = getConfirmationRedirectUrl();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        ...(confirmationRedirectUrl ? { emailRedirectTo: confirmationRedirectUrl } : {}),
        data: {
          name: data.name,
          phone: data.phone,
          brand: "Renato Cortes Barbearia"
        }
      }
    });

    if (error) {
      const friendlyError = getFriendlySignUpError(error);
      if (friendlyError.field) {
        setError(friendlyError.field, {
          type: "manual",
          message: friendlyError.message
        });
        return;
      }
      setFormError(friendlyError.message);
      return;
    }

    if (!authData.user) {
      setFormError("Não foi possível criar sua conta agora. Tente novamente.");
      return;
    }

    if (authData.user.identities?.length === 0) {
      setError("email", {
        type: "manual",
        message: "Conta já existente, informe outro e-mail ou redefina a senha."
      });
      return;
    }

    if (!authData.session) {
      router.push("/login?registered=check-email");
      return;
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        phone: data.phone
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      await supabase.auth.signOut();
      setFormError(payload?.message ?? "Sua conta foi criada, mas não conseguimos configurar seu perfil.");
      return;
    }

    router.push("/cliente");
  }

  return (
    <AuthLayout mode="register">
      <form onSubmit={handleSubmit(onSubmit)} className="panel-glass w-full max-w-3xl rounded-[18px] px-7 py-10 md:px-14 md:py-14">
        <Link href="/" className="mb-9 inline-flex items-center gap-3 text-sm font-bold uppercase">
          <ArrowLeft className="h-5 w-5" />
          Voltar
        </Link>
        <div className="text-center">
          <h1 className="text-4xl font-black uppercase">
            Criar <span className="text-primary">conta</span>
          </h1>
          <p className="mt-4 text-lg text-white/65">Preencha os dados abaixo para se cadastrar.</p>
        </div>

        <div className="mt-9 grid gap-5">
          <label className="grid gap-3">
            <span className="font-bold">Nome completo</span>
            <Input icon={<User className="h-5 w-5" />} placeholder="Digite seu nome completo" {...register("name")} />
            {errors.name ? <span className="text-sm text-primary">{errors.name.message}</span> : null}
          </label>
          <label className="grid gap-3">
            <span className="font-bold">Telefone</span>
            <Input icon={<Phone className="h-5 w-5" />} placeholder="(00) 00000-0000" {...register("phone")} />
            {errors.phone ? <span className="text-sm text-primary">{errors.phone.message}</span> : null}
          </label>
          <label className="grid gap-3">
            <span className="font-bold">E-mail</span>
            <Input icon={<Mail className="h-5 w-5" />} placeholder="Digite seu e-mail" {...register("email")} />
            {errors.email ? (
              <span className="text-sm text-primary">
                {errors.email.message === "Conta já existente, informe outro e-mail ou redefina a senha." ? (
                  <>
                    Conta já existente, informe outro e-mail ou{" "}
                    <Link href="/recuperar-senha" className="font-bold underline underline-offset-2">
                      redefina a senha
                    </Link>
                    .
                  </>
                ) : (
                  errors.email.message
                )}
              </span>
            ) : null}
          </label>
          <label className="grid gap-3">
            <span className="font-bold">Senha</span>
            <Input
              icon={<Lock className="h-5 w-5" />}
              trailing={
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label="Mostrar senha">
                  {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              }
              type={showPassword ? "text" : "password"}
              placeholder="Digite sua senha"
              {...register("password")}
            />
            <span className="text-sm text-white/55">Mínimo de 6 caracteres, com letras, números ou caracteres especiais (!, @, #).</span>
            {errors.password ? <span className="text-sm text-primary">{errors.password.message}</span> : null}
          </label>
          <label className="grid gap-3">
            <span className="font-bold">Confirmar senha</span>
            <Input
              icon={<Lock className="h-5 w-5" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label="Mostrar confirmacao de senha"
                >
                  {showConfirmPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              }
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirme sua senha"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <span className="text-sm text-primary">{errors.confirmPassword.message}</span>
            ) : null}
          </label>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <Checkbox checked={accepted} onCheckedChange={setAccepted} />
          <p className="text-sm md:text-base">
            Aceito os{" "}
            <button type="button" className="text-primary underline" onClick={() => setLegalDocument("terms")}>
              Termos de Uso
            </button>{" "}
            e a{" "}
            <button type="button" className="text-primary underline" onClick={() => setLegalDocument("privacy")}>
              Política de Privacidade
            </button>
          </p>
        </div>

        {formError ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{formError}</p> : null}

        <Button type="submit" size="lg" className="mt-9 w-full" disabled={!accepted || isSubmitting}>
          {isSubmitting ? "Criando..." : "Criar conta"}
          <ArrowRight className="h-6 w-6" />
        </Button>

        <div className="mt-10 flex items-center gap-7 text-center text-white/70">
          <span className="h-px flex-1 bg-white/18" />
          Já tem uma conta?
          <Link href="/login" className="font-bold text-primary">
            Entrar
          </Link>
          <span className="h-px flex-1 bg-white/18" />
        </div>
      </form>
      {legalDocument ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5 backdrop-blur-sm" role="presentation" onMouseDown={() => setLegalDocument(null)}>
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[16px] border border-primary/30 bg-[#101010] p-6 shadow-panel md:p-8" role="dialog" aria-modal="true" aria-labelledby="legal-document-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Renato Cortes Barbearia</p>
                <h2 id="legal-document-title" className="mt-2 text-2xl font-black uppercase md:text-3xl">{legalDocument === "terms" ? "Termos de Uso" : "Política de Privacidade"}</h2>
              </div>
              <button type="button" onClick={() => setLegalDocument(null)} className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-primary" aria-label="Fechar">
                <X className="h-6 w-6" />
              </button>
            </div>

            {legalDocument === "terms" ? <TermsOfUse /> : <PrivacyPolicy />}

            <Button type="button" variant="outline" className="mt-8 w-full" onClick={() => setLegalDocument(null)}>Entendi</Button>
          </section>
        </div>
      ) : null}
    </AuthLayout>
  );
}

function TermsOfUse() {
  return <div className="mt-7 grid gap-5 text-sm leading-relaxed text-white/75">
    <p>Ao criar uma conta, você concorda em fornecer informações verdadeiras e manter seus dados de acesso em segurança.</p>
    <p>Os agendamentos estão sujeitos à disponibilidade da equipe. Cancelamentos e alterações devem ser solicitados com antecedência pelos canais disponibilizados pela barbearia.</p>
    <p>Assinaturas, serviços e produtos seguem as condições, valores e benefícios informados no momento da contratação. A Renato Cortes Barbearia poderá atualizar estes termos para refletir mudanças em seus serviços.</p>
    <p>O uso indevido da plataforma, incluindo tentativas de acesso não autorizado, poderá resultar no bloqueio da conta.</p>
  </div>;
}

function PrivacyPolicy() {
  return <div className="mt-7 grid gap-5 text-sm leading-relaxed text-white/75">
    <p>Utilizamos seus dados de cadastro, como nome, e-mail e telefone, para criar sua conta, realizar agendamentos, prestar atendimento e comunicar informações sobre os serviços contratados.</p>
    <p>Os dados são tratados com medidas de segurança e não são vendidos. Poderão ser compartilhados apenas quando necessários para a execução dos serviços, cumprimento de obrigações legais ou com seu consentimento.</p>
    <p>Você pode solicitar a atualização, correção ou exclusão de dados, respeitadas as obrigações legais de retenção, pelos canais de atendimento da Renato Cortes Barbearia.</p>
    <p>Ao continuar, você declara estar ciente deste tratamento de dados para as finalidades descritas acima.</p>
  </div>;
}
