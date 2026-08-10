"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth-store";
import type { UserRole } from "@/types/auth";
import { createClient } from "@/utils/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.")
});

type LoginFormData = z.infer<typeof loginSchema>;

function getDashboardPath(role: UserRole, hasBarber = false) {
  if (role === "CLIENT") return "/cliente";
  if (role === "BARBER" || (role === "ADMIN" && hasBarber)) return "/funcionario";
  return "/admin";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("registered") === "check-email") {
      setFormError("Conta criada com sucesso. Enviamos um e-mail da Renato Cortes Barbearia para confirmar sua conta. Depois de confirmar, volte aqui e faça login.");
    }

    if (params.get("password") === "updated") {
      setFormError("Senha atualizada. Entre com sua nova senha.");
    }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const response = await fetch("/api/auth/me").catch(() => null);
        const user = response?.ok ? await response.json() : null;
        router.replace(user?.role ? getDashboardPath(user.role, Boolean(user.hasBarber)) : "/cliente");
      }
    });
  }, [router]);

  async function onSubmit(data: LoginFormData) {
    setFormError(null);
    try {
      const user = await login({ email: data.email, password: data.password });
      router.push(getDashboardPath(user.role, Boolean(user.hasBarber)));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível entrar.");
    }
  }

  return (
    <AuthLayout mode="login">
      <form onSubmit={handleSubmit(onSubmit)} className="panel-glass w-full max-w-3xl rounded-[20px] px-7 py-10 md:px-16 md:py-20">
        <Link href="/" className="mb-12 inline-flex items-center gap-3 text-sm font-bold uppercase text-white/78 hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
          Voltar
        </Link>
        <h1 className="text-4xl font-black uppercase leading-tight md:text-5xl">
          Bem-vindo
          <span className="block text-primary">de volta!</span>
        </h1>
        <p className="mt-4 text-lg text-white/65">Faça login para acessar sua conta.</p>

        <div className="mt-12 grid gap-7">
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
            {errors.password ? <span className="text-sm text-primary">{errors.password.message}</span> : null}
          </label>
        </div>

        <div className="mt-8 flex justify-end">
          <Link className="text-primary underline underline-offset-4" href="/recuperar-senha">
            Esqueci minha senha
          </Link>
        </div>

        {formError ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{formError}</p> : null}

        <Button type="submit" size="lg" className="mt-10 w-full" disabled={isLoading}>
          {isLoading ? "Entrando..." : "Entrar"}
          <ArrowRight className="h-6 w-6" />
        </Button>

        <div className="my-10 flex items-center gap-7 text-center text-white/70">
          <span className="h-px flex-1 bg-white/18" />
          Ainda não tem uma conta?
          <span className="h-px flex-1 bg-white/18" />
        </div>

        <Link href="/cadastro">
          <Button type="button" variant="outline" size="lg" className="w-full">
            Criar conta
            <ArrowRight className="h-6 w-6" />
          </Button>
        </Link>
      </form>
    </AuthLayout>
  );
}
