const BASE = "/api";

export type Product = {
  id: number;
  vendorPartnerId: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceInr: number;
  originalPriceInr: number;
  imageUrl: string;
  gallery: string[];
  sizes: string[];
  colors: string[];
  stock: number;
  status: string;
  createdAt?: string;
};

export type ProductWithVendor = Product & {
  vendor: { id: number; name: string; city: string } | null;
};

export type Vendor = { id: number; name: string; city: string };

export type StoreCategory = { name: string; slug: string; sortOrder: number };

export type ProductOrder = {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPincode: string;
  totalInr: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items?: Array<{
    id: number;
    orderId: number;
    productId: number;
    vendorPartnerId: number;
    productName: string;
    unitPriceInr: number;
    qty: number;
    status?: string;
    variant?: string;
  }>;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const storeApi = {
  listProducts: (params: { category?: string; q?: string; vendorId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    if (params.vendorId) qs.set("vendorId", String(params.vendorId));
    const s = qs.toString();
    return req<Product[]>(`/store/products${s ? `?${s}` : ""}`);
  },
  getProduct: (slug: string) => req<ProductWithVendor>(`/store/products/${slug}`),
  listVendors: () => req<Vendor[]>("/store/vendors"),
  listCategories: () => req<StoreCategory[]>("/store/categories"),
  checkout: (body: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress: string;
    shippingCity: string;
    shippingPincode: string;
    items: { productId: number; qty: number; size?: string; color?: string }[];
    redeemPoints?: number;
  }) =>
    req<{
      ok: true;
      orderId: number;
      total: number;
      redeemedInr?: number;
      subtotalInr?: number;
      cgstInr?: number;
      sgstInr?: number;
      shippingInr?: number;
      paymentUrl: string;
    }>("/store/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
