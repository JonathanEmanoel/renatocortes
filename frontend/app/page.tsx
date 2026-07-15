import Link from "next/link";
import { CalendarDays, Home, MessageSquare, Scissors, ShoppingBag, Star, User } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";

const services = [
  { label: "Corte de cabelo", icon: Scissors },
  { label: "Corte + barba", icon: User },
  { label: "Corte + barba + sobrancelha", icon: Home },
  { label: "Planos de assinatura", icon: Star }
];

const products = [
  { name: "Pomada modeladora", price: "R$ 45,00" },
  { name: "Óleo para barba", price: "R$ 55,00" },
  { name: "Shampoo para barba", price: "R$ 35,00" }
];

const bottomNav = [
  { label: "Home", icon: Home, active: true },
  { label: "Agendar", icon: CalendarDays },
  { label: "Assinaturas", icon: Star },
  { label: "Loja", icon: ShoppingBag },
  { label: "Contato", icon: MessageSquare }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black pb-28 text-white">
      <Navbar />
      <section className="barber-texture relative flex min-h-[760px] items-center justify-center overflow-hidden px-5 pt-36 text-center">
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <p className="mb-5 flex items-center justify-center gap-4 text-sm font-bold uppercase tracking-[0.28em] text-white/82">
            <span className="h-px w-8 bg-primary" />
            Seu estilo, nossa arte.
            <span className="h-px w-8 bg-accentBlue" />
          </p>
          <h1 className="font-display text-6xl font-black italic leading-none text-white md:text-8xl">
            Renato Cortes
          </h1>
          <div className="mt-5 flex items-center justify-center gap-6">
            <span className="h-px w-16 bg-white/50" />
            <p className="text-2xl font-black uppercase tracking-[0.34em] text-primary md:text-4xl">
              Barbearia
            </p>
            <span className="h-px w-16 bg-white/50" />
          </div>
          <p className="mx-auto mt-8 max-w-lg text-xl leading-relaxed text-white/88 md:text-2xl">
            Mais que um corte, entregamos confiança. Tradição, qualidade e estilo em cada detalhe.
          </p>
          <Link href="/login">
            <Button size="lg" className="mt-10 w-full max-w-md text-base">
              <CalendarDays className="h-6 w-6" />
              Agendar horário
            </Button>
          </Link>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#050505] px-5 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-9 flex items-center justify-center gap-8">
            <span className="hidden h-px w-40 bg-white/16 sm:block" />
            <h2 className="text-center text-2xl font-black uppercase tracking-[0.08em]">Nossos serviços</h2>
            <span className="hidden h-px w-40 bg-white/16 sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-7 md:grid-cols-4">
            {services.map((service) => (
              <div key={service.label} className="text-center">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-white/60 bg-black ring-2 ring-primary/50">
                  <service.icon className="h-9 w-9 text-white" />
                </div>
                <p className="mx-auto mt-4 max-w-[160px] text-sm font-black uppercase leading-relaxed tracking-[0.04em] md:text-base">
                  {service.label}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-9 flex justify-center gap-3">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span className="h-3 w-3 rounded-full bg-white/30" />
            <span className="h-3 w-3 rounded-full bg-white/30" />
          </div>
        </div>
      </section>

      <section className="px-5 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex items-center justify-between gap-6">
            <h2 className="text-xl font-black uppercase tracking-[0.08em] md:text-2xl">
              Produtos em destaque
            </h2>
            <Link href="/login" className="text-sm font-black uppercase tracking-[0.08em] text-primary">
              Ver todos
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {products.map((product) => (
              <article key={product.name} className="overflow-hidden rounded-[8px] border border-white/14 bg-card">
                <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-[#17110d] to-black">
                  <ShoppingBag className="h-20 w-20 text-white/85" />
                </div>
                <div className="flex items-end justify-between gap-5 p-5">
                  <div>
                    <h3 className="font-bold uppercase">{product.name}</h3>
                    <p className="mt-6 text-xl font-black text-primary">{product.price}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Adicionar ${product.name}`}>
                    <ShoppingBag className="h-7 w-7" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/96 px-3 py-4 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {bottomNav.map((item) => (
            <Link
              href={item.active ? "/" : "/login"}
              key={item.label}
              className={`flex flex-col items-center gap-2 text-[11px] font-bold uppercase ${
                item.active ? "text-primary" : "text-white"
              }`}
            >
              <item.icon className="h-7 w-7" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
