export type StoredCartItem = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  stock: number;
  quantity: number;
};

export const CART_STORAGE_KEY = "renato-cortes-cart";

/**
 * Recupera o carrinho local sem interromper renderizacao no servidor ou por JSON
 * corrompido. Valida somente se e array; precos/estoque armazenados nao sao fonte
 * confiavel para a API que efetiva a compra.
 */
export function readStoredCart() {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as StoredCartItem[]) : [];
  } catch {
    return [];
  }
}

/** Persiste no navegador; deve ser chamada em fluxo cliente com localStorage disponivel. */
export function writeStoredCart(items: StoredCartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

/**
 * Unifica itens pelo produto e limita incrementos ao estoque do item ja salvo.
 * Um produto novo e inserido como recebido; a verificacao definitiva de estoque
 * e preco continua no servidor porque os dados locais podem estar desatualizados.
 */
export function addStoredCartItem(item: StoredCartItem) {
  const current = readStoredCart();
  const existing = current.find((cartItem) => cartItem.id === item.id);
  const next = existing
    ? current.map((cartItem) =>
        cartItem.id === item.id
          ? { ...cartItem, quantity: Math.min(cartItem.stock, cartItem.quantity + item.quantity) }
          : cartItem
      )
    : [...current, item];

  writeStoredCart(next);
  return next;
}
