"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth-store";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
  remember: z.boolean().optional()
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [formError, setFormError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false
    }
  });

  async function onSubmit(data: LoginFormData) {
    setFormError(null);
    try {
      const user = await login({ email: data.email, password: data.password });
      router.push(user.role === "CLIENT" ? "/cliente" : "/funcionario");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível entrar.");
    }
  }

  return (
    <AuthLayout mode="login">
      <form onSubmit={handleSubmit(onSubmit)} className="panel-glass w-full max-w-3xl rounded-[18px] px-7 py-10 md:px-16 md:py-20">
        <Link href="/" className="mb-12 inline-flex items-center gap-3 text-sm font-bold uppercase">
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
              trailing={<EyeOff className="h-5 w-5" />}
              type="password"
              placeholder="Digite sua senha"
              {...register("password")}
            />
            {errors.password ? <span className="text-sm text-primary">{errors.password.message}</span> : null}
          </label>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
          <label className="flex items-center gap-4">
            <Checkbox checked={remember} onCheckedChange={setRemember} />
            <span>Lembrar-me</span>
          </label>
          <a className="text-primary underline underline-offset-4" href="#">
            Esqueci minha senha
          </a>
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

        <p className="mx-auto mt-14 max-w-lg text-center text-sm leading-relaxed text-white/62">
          Ao continuar, você concorda com nossos{" "}
          <a className="text-primary underline" href="#">
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a className="text-primary underline" href="#">
            Política de Privacidade
          </a>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
