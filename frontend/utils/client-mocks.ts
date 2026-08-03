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
  { id: "corte-normal", name: "Corte Normal", duration: "35 min", price: "R$ 22,00", icon: Scissors },
  { id: "corte-degrade", name: "Corte Degradê", duration: "40 min", price: "R$ 25,00", icon: Scissors },
  { id: "corte-degrade-navalhado", name: "Corte Degradê Navalhado", duration: "45 min", price: "R$ 30,00", icon: Scissors },
  { id: "corte-crianca", name: "Corte de Criança (1 a 10 anos)", duration: "35 min", price: "R$ 25,00", icon: Scissors },
  { id: "corte-tesoura", name: "Corte Todo na Tesoura", duration: "45 min", price: "R$ 25,00", icon: Scissors },
  { id: "barba", name: "Barba", duration: "25 min", price: "R$ 15,00", icon: Star },
  { id: "cantinhos", name: "Só os Cantinhos", duration: "15 min", price: "R$ 10,00", icon: Sparkles },
  { id: "sobrancelha", name: "Sobrancelha", duration: "10 min", price: "R$ 5,00", icon: Sparkles },
  { id: "alisamento", name: "Alisamento", duration: "35 min", price: "R$ 20,00", icon: Sparkles },
  { id: "luzes", name: "Luzes", duration: "90 min", price: "A partir de R$ 70,00", icon: Sparkles },
  { id: "platinado", name: "Platinado", duration: "120 min", price: "A partir de R$ 80,00", icon: Sparkles }
];

export const barbers: Barber[] = [
  { id: "renato", name: "Renato", specialty: "Cortes clássicos, degradê e finalização premium", rating: "5.0" },
  { id: "renan", name: "Renan", specialty: "Barba, acabamento e cortes modernos", rating: "5.0" },
  { id: "italo", name: "Ítalo", specialty: "Degradê navalhado, luzes e platinado", rating: "5.0" }
];

export const appointments: Appointment[] = [
  {
    id: "1",
    date: "18 Jul 2026",
    time: "10:30",
    barber: "Renan",
    service: "Corte Degradê",
    status: "Confirmado"
  },
  {
    id: "2",
    date: "22 Jun 2026",
    time: "14:00",
    barber: "Renato",
    service: "Corte Normal",
    status: "Concluido"
  },
  {
    id: "3",
    date: "11 Jun 2026",
    time: "09:30",
    barber: "Ítalo",
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
    name: "Oleo para barba",
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
    name: "Balm pos-barba",
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
    id: "plano-cabelo",
    name: "Plano Cabelo",
    price: "R$75/mês",
    benefits: ["Cortes ilimitados"]
  },
  {
    id: "plano-barba",
    name: "Plano Barba",
    price: "R$65/mês",
    benefits: ["Barba ilimitada"]
  },
  {
    id: "plano-cabelo-barba",
    name: "Plano Cabelo + Barba",
    price: "R$130/mês",
    benefits: ["Corte + barba ilimitados"],
    featured: true
  }
];

export const quickActions = [
  { href: "/cliente/agendamento", label: "Agendar Horário", icon: CalendarDays },
  { href: "/cliente/loja", label: "Loja", icon: ShoppingBag },
  { href: "/cliente/assinaturas", label: "Assinaturas", icon: Star },
  { href: "/cliente/meus-agendamentos", label: "Meus Agendamentos", icon: ClipboardList }
];

export const availableTimes = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "16:30"];
