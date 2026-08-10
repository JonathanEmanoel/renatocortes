const BARBERSHOP_WHATSAPP = "5581997207222";

export function normalizeBrazilianWhatsApp(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (!digits) return BARBERSHOP_WHATSAPP;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;

  return BARBERSHOP_WHATSAPP;
}

export function buildWhatsAppUrl(message: string, phone?: string | null) {
  return `https://wa.me/${normalizeBrazilianWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}
