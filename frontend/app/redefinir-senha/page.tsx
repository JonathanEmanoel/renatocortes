"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

const resetSchema = z
  .object({
    password: z.string().min(6, "Use no mínimo 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirme sua nova senha.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmPassword"]
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setHasRecoverySession(Boolean(data.session)));
  }, []);

  async function onSubmit(data: ResetFormData) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });

    if (error) {
      setFormError("Este link de recuperação expirou ou é inválido. Solicite um novo link.");
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?password=updated");
  }

  const passwordToggle = (show: boolean, toggle: () => void, label: string) => (
    <button type="button" onClick={toggle} aria-label={label}>
      {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
    </button>
  );

  return (
    <AuthLayout mode="recovery">
      <form onSubmit={handleSubmit(onSubmit)} className="panel-glass w-full max-w-2xl rounded-[20px] px-7 py-10 md:px-14 md:py-14">
        <Link href="/login" className="mb-10 inline-flex items-center gap-3 text-sm font-bold uppercase text-white/78 hover:text-primary">
          <ArrowLeft className="h-5 w-5" />
          Voltar ao login
        </Link>
        <h1 className="text-4xl font-black uppercase leading-tight md:text-5xl">
          Nova <span className="block text-primary">senha</span>
        </h1>
        <p className="mt-4 text-lg text-white/65">Escolha uma nova senha para acessar sua conta.</p>

        {hasRecoverySession === false ? (
          <p className="mt-10 rounded-[8px] border border-primary/50 p-4 text-primary">
            Este link de recuperação expirou ou é inválido. Solicite um novo link.
          </p>
        ) : (
          <>
            <div className="mt-10 grid gap-6">
              <label className="grid gap-3">
                <span className="font-bold">Nova senha</span>
                <Input icon={<Lock className="h-5 w-5" />} type={showPassword ? "text" : "password"} placeholder="Digite sua nova senha" trailing={passwordToggle(showPassword, () => setShowPassword((current) => !current), "Mostrar senha")} {...register("password")} />
                {errors.password ? <span className="text-sm text-primary">{errors.password.message}</span> : null}
              </label>
              <label className="grid gap-3">
                <span className="font-bold">Confirmar nova senha</span>
                <Input icon={<Lock className="h-5 w-5" />} type={showConfirmPassword ? "text" : "password"} placeholder="Confirme sua nova senha" trailing={passwordToggle(showConfirmPassword, () => setShowConfirmPassword((current) => !current), "Mostrar confirmação de senha")} {...register("confirmPassword")} />
                {errors.confirmPassword ? <span className="text-sm text-primary">{errors.confirmPassword.message}</span> : null}
              </label>
            </div>
            {formError ? <p className="mt-6 rounded-[8px] border border-primary/50 p-4 text-primary">{formError}</p> : null}
            <Button type="submit" size="lg" className="mt-10 w-full" disabled={hasRecoverySession !== true || isSubmitting}>
              {isSubmitting ? "Salvando..." : "Redefinir senha"}
              <ArrowRight className="h-6 w-6" />
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
