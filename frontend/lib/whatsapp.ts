const BARBERSHOP_WHATSAPP = "5581995864757";

export function buildWhatsAppUrl(message: string) {
  return `https://wa.me/${BARBERSHOP_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
