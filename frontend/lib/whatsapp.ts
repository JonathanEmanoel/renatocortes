const BARBERSHOP_WHATSAPP = "5581997207222";

/**
 * Remove mascara e acrescenta DDI brasileiro quando ha DDD/numero suficientes.
 * Entrada vazia ou curta usa o contato oficial da barbearia. E normalizacao
 * permissiva, nao validacao de existencia do telefone no WhatsApp.
 */
export function normalizeBrazilianWhatsApp(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (!digits) return BARBERSHOP_WHATSAPP;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;

  return BARBERSHOP_WHATSAPP;
}

/**
 * Produz link HTTPS utilizavel no navegador e no celular, com mensagem codificada
 * uma unica vez. Somente monta o link; nao envia mensagens automaticamente.
 */
export function buildWhatsAppUrl(message: string, phone?: string | null) {
  return `https://wa.me/${normalizeBrazilianWhatsApp(phone)}?text=${encodeURIComponent(message)}`;
}
