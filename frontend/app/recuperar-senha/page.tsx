"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

const recoverySchema = z.object({
  email: z.string().email("Informe um e-mail válido.")
});

type RecoveryFormData = z.infer<typeof recoverySchema>;

export default function PasswordRecoveryPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RecoveryFormData>({ resolver: zodResolver(recoverySchema) });

  async function onSubmit(data: RecoveryFormData) {
    setError(null);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/redefinir-senha`
    });

    if (resetError) {
      setError("Não foi possível enviar o e-mail de recuperação. Tente novamente.");
      return;
    }

    setSent(true);
  }

  return (
    <AuthLayout mode="recovery">
      <form onSubmit={handleSubmit(onSubmit)} className="panel-glass w-full max-w-2xl rounded-[20px] px-7 py-10 md:px-14 md:py-14">
        <Link href="/login" className="mb-10 inline-flex items-center gap-3 text-sm font-bold uppercase text-white/78 hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
          Voltar ao login
        </Link>
        <h1 className="text-4xl font-black uppercase leading-tight md:text-5xl">
          Recuperar <span className="block text-primary">senha</span>
        </h1>
        <p className="mt-4 text-lg text-white/65">Informe seu e-mail para receber um link de redefinição.</p>

        {sent ? (
          <p className="mt-10 rounded-[8px] border border-primary/50 p-4 text-primary">
            Se existir uma conta para este e-mail, enviaremos as instruções de recuperação em instantes.
          </p>
        ) : (
          <>
            <label className="mt-10 grid gap-3">
              <span className="font-bold">E-mail</span>
              <Input icon={<Mail className="h-5 w-5" />} placeholder="Digite seu e-mail" {...register("email")} />
              {errors.email ? <span className="text-sm text-primary">{errors.email.message}</span> : null}
            </label>
            {error ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{error}</p> : null}
            <Button type="submit" size="lg" className="mt-10 w-full" disabled={isSubmitting}>
              {isSubmitting ? "Enviando..." : "Enviar link de recuperação"}
              <ArrowRight className="h-6 w-6" />
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
