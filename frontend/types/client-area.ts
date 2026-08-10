import type { LucideIcon } from "lucide-react";

export type Client = {
  name: string;
  email: string;
  phone: string;
};

export type ProductCategory = "Todos" | string;

export type Product = {
  id: string;
  name: string;
  price: string;
  description: string;
  category: ProductCategory;
  image?: string;
  stock?: number;
};

export type Service = {
  id: string;
  name: string;
  duration: string;
  durationMinutes?: number;
  price: string;
  priceValue?: number;
  coveredBySubscription?: boolean;
  icon: LucideIcon;
};

export type Barber = {
  id: string;
  name: string;
  specialty: string;
  rating?: string;
};

export type Appointment = {
  id: string;
  date: string;
  time: string;
  barber: string;
  service: string;
  status: "Pendente" | "Confirmado" | "Recusado" | "Concluido" | "Cancelado";
  observations?: string;
  duration?: string;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  price: string;
  benefits: string[];
  description?: string;
  periodicity?: string;
  featured?: boolean;
};
