import { ShieldCheck, Scissors, Star } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const benefits = [
  {
    icon: ShieldCheck,
    title: "Segurança",
    text: "Seus dados sempre protegidos"
  },
  {
    icon: Scissors,
    title: "Praticidade",
    text: "Agende e gerencie seus horários com facilidade"
  },
  {
    icon: Star,
    title: "Exclusividade",
    text: "Benefícios e ofertas exclusivas para você"
  }
];

type AuthLayoutProps = {
  children: React.ReactNode;
  mode: "login" | "register";
};

export function AuthLayout({ children, mode }: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="grid min-h-screen lg:grid-cols-[38%_1fr]">
        <aside className="auth-chair hidden min-h-screen flex-col justify-between px-12 py-14 lg:flex">
          <Logo className="items-start" />
          <div>
            <div className="mb-8 h-[2px] w-16 bg-primary" />
            <h1 className="max-w-sm text-4xl font-black uppercase leading-tight">
              Seu estilo,
              <span className="block text-primary">nossa arte.</span>
            </h1>
            <p className="mt-6 max-w-sm text-lg leading-relaxed text-white/78">
              {mode === "login"
                ? "Faça login e agende seu horário, compre produtos e aproveite benefícios exclusivos."
                : "Crie sua conta e aproveite o melhor da nossa barbearia."}
            </p>
            <div className="mt-12 grid max-w-xl grid-cols-1 gap-6 xl:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title}>
                  <benefit.icon className="mb-4 h-9 w-9 text-primary" />
                  <p className="text-sm font-black uppercase">{benefit.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/68">{benefit.text}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-white/58">© 2024 Renato Cortes Barbearia.</p>
        </aside>
        <section className="barber-texture flex min-h-screen items-center justify-center px-5 py-10 lg:px-12">
          {children}
        </section>
      </div>
    </main>
  );
}
