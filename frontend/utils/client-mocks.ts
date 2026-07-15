import { CalendarDays, ClipboardList, Scissors, ShoppingBag, Sparkles, Star } from "lucide-react";
import type {
  Appointment,
  Barber,
  Client,
  Product,
  ProductCategory,
  Service,
  SubscriptionPlan
} from "@/types/client-area";

export const mockClient: Client = {
  name: "Jonathan",
  email: "jonathan@email.com",
  phone: "(11) 99999-0000"
};

export const services: Service[] = [
  { id: "corte", name: "Corte", duration: "45 min", price: "R$ 45,00", icon: Scissors },
  { id: "corte-barba", name: "Corte + Barba", duration: "70 min", price: "R$ 80,00", icon: Star },
  {
    id: "corte-barba-sobrancelha",
    name: "Corte + Barba + Sobrancelha",
    duration: "90 min",
    price: "R$ 95,00",
    icon: Sparkles
  }
];

export const barbers: Barber[] = [
  { id: "renan", name: "Renan Cortes", specialty: "Cortes clássicos e barba", rating: "4.9" },
  { id: "marcos", name: "Marcos Silva", specialty: "Degradê e acabamento", rating: "4.8" },
  { id: "daniel", name: "Daniel Rocha", specialty: "Barba premium", rating: "4.7" }
];

export const appointments: Appointment[] = [
  {
    id: "1",
    date: "18 Jul 2026",
    time: "10:30",
    barber: "Renan Cortes",
    service: "Corte + Barba",
    status: "Confirmado"
  },
  {
    id: "2",
    date: "22 Jun 2026",
    time: "14:00",
    barber: "Marcos Silva",
    service: "Corte",
    status: "Concluido"
  },
  {
    id: "3",
    date: "11 Jun 2026",
    time: "09:30",
    barber: "Daniel Rocha",
    service: "Barba",
    status: "Concluido"
  }
];

export const productCategories: ProductCategory[] = ["Todos", "Pomadas", "Oleos", "Shampoo", "Acessorios"];

export const products: Product[] = [
  {
    id: "pomada-modeladora",
    name: "Pomada modeladora",
    price: "R$ 45,00",
    description: "Fixação forte com acabamento natural para o dia todo.",
    category: "Pomadas"
  },
  {
    id: "oleo-para-barba",
    name: "Óleo para barba",
    price: "R$ 55,00",
    description: "Hidrata, perfuma e deixa os fios mais alinhados.",
    category: "Oleos"
  },
  {
    id: "shampoo-para-barba",
    name: "Shampoo para barba",
    price: "R$ 35,00",
    description: "Limpeza profunda sem ressecar a pele.",
    category: "Shampoo"
  },
  {
    id: "balm-pos-barba",
    name: "Balm pós-barba",
    price: "R$ 48,00",
    description: "Acalma a pele e reduz irritações após o barbear.",
    category: "Acessorios"
  },
  {
    id: "pente-madeira",
    name: "Pente de madeira",
    price: "R$ 28,00",
    description: "Controle e acabamento para barba e cabelo.",
    category: "Acessorios"
  },
  {
    id: "shampoo-antiqueda",
    name: "Shampoo antiquedas",
    price: "R$ 52,00",
    description: "Fortalece os fios e mantém o couro cabeludo limpo.",
    category: "Shampoo"
  }
];

export const plans: SubscriptionPlan[] = [
  {
    id: "corte-cabelo",
    name: "Corte de Cabelo",
    price: "R$75/mês",
    benefits: ["Cortes ilimitados", "Economia mensal", "Prioridade na agenda"]
  },
  {
    id: "barba",
    name: "Barba",
    price: "R$65/mês",
    benefits: ["Barba ilimitada", "Acabamento premium", "Produtos selecionados"]
  },
  {
    id: "corte-barba",
    name: "Corte + Barba",
    price: "R$130/mês",
    benefits: ["Corte e barba ilimitados", "Maior economia", "Atendimento preferencial"],
    featured: true
  },
  {
    id: "combo-completo",
    name: "Corte + Barba + Sobrancelha",
    price: "Em breve",
    benefits: ["Plano completo", "Benefícios exclusivos", "Visual sempre alinhado"]
  }
];

export const quickActions = [
  { href: "/cliente/agendamento", label: "Agendar Horário", icon: CalendarDays },
  { href: "/cliente/loja", label: "Loja", icon: ShoppingBag },
  { href: "/cliente/assinaturas", label: "Assinaturas", icon: Star },
  { href: "/cliente/meus-agendamentos", label: "Meus Agendamentos", icon: ClipboardList }
];

export const availableTimes = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "16:30"];
