import type { LucideIcon } from "lucide-react";

export type Client = {
  name: string;
  email: string;
  phone: string;
};

export type ProductCategory = "Todos" | "Pomadas" | "Oleos" | "Shampoo" | "Acessorios";

export type Product = {
  id: string;
  name: string;
  price: string;
  description: string;
  category: ProductCategory;
};

export type Service = {
  id: string;
  name: string;
  duration: string;
  price: string;
  icon: LucideIcon;
};

export type Barber = {
  id: string;
  name: string;
  specialty: string;
  rating: string;
};

export type Appointment = {
  id: string;
  date: string;
  time: string;
  barber: string;
  service: string;
  status: "Confirmado" | "Concluido" | "Cancelado";
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  price: string;
  benefits: string[];
  featured?: boolean;
};
