"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User } from "lucide-react";
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

export default function RegisterPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema)
  });

  async function onSubmit(data: RegisterFormData) {
    setFormError(null);
    const supabase = createClient();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          phone: data.phone
        }
      }
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("already registered") || message.includes("already exists")) {
        setFormError("Este e-mail já está cadastrado. Faça login para continuar.");
        return;
      }
      setFormError("Não foi possível criar sua conta agora. Verifique os dados e tente novamente.");
      return;
    }

    if (!authData.user) {
      setFormError("Não foi possível criar sua conta agora. Tente novamente.");
      return;
    }

    if (!authData.session) {
      router.push("/login");
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
            {errors.email ? <span className="text-sm text-primary">{errors.email.message}</span> : null}
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
            <span className="text-sm text-white/55">Mínimo de 6 caracteres com letras e números.</span>
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
            <a className="text-primary underline" href="#">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a className="text-primary underline" href="#">
              Política de Privacidade
            </a>
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
    </AuthLayout>
  );
}
