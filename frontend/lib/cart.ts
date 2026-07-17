export type StoredCartItem = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  stock: number;
  quantity: number;
};

export const CART_STORAGE_KEY = "renato-cortes-cart";

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

export function writeStoredCart(items: StoredCartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

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
