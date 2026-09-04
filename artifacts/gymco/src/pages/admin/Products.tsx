import { useEffect, useState } from "react";
import { AdminLayout, AdminCard } from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/adminApi";
import { storeApi, type StoreCategory } from "@/lib/storeApi";
import FileUpload from "@/components/FileUpload";
import { Plus, Trash2, X, Package } from "lucide-react";

type Product = {
  id: number;
  vendorPartnerId: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceInr: number;
  originalPriceInr: number;
  imageUrl: string;
  gallery?: string[];
  sizes?: string[];
  colors?: string[];
  stock: number;
  status: string;
  cgstPercent?: number;
  sgstPercent?: number;
};

type Partner = { id: number; name: string; city: string; status: string };

const INPUT =
  "w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-lime-500/60";

type FormState = {
  vendorPartnerId: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceInr: number;
  originalPriceInr: number;
  imageUrl: string;
  gallery: string[];
  sizes: string;
  colors: string;
  stock: number;
  status: string;
  cgstPercent: number;
  sgstPercent: number;
};

const blank = (): FormState => ({
  vendorPartnerId: 0,
  name: "",
  slug: "",
  description: "",
  category: "apparel",
  priceInr: 0,
  originalPriceInr: 0,
  imageUrl: "",
  gallery: [],
  sizes: "",
  colors: "",
  stock: 0,
  status: "active",
  cgstPercent: 0,
  sgstPercent: 0,
});

function toList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function AdminProducts() {
  const [rows, setRows] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(blank());
  const [err, setErr] = useState<string | null>(null);
  const [shipping, setShipping] = useState<number>(0);
  const [shippingSaved, setShippingSaved] = useState(false);

  const load = () => {
    Promise.all([adminApi.products.list(), adminApi.partners.list()]).then(
      ([ps, prs]) => {
        setRows(ps as Product[]);
        setPartners(prs as Partner[]);
      },
    );
  };
  useEffect(load, []);
  useEffect(() => {
    storeApi.listCategories().then(setCategories).catch(() => setCategories([]));
    adminApi.storeShipping
      .get()
      .then((r) => setShipping(r.shippingInr))
      .catch(() => {});
  }, []);

  const saveShipping = async () => {
    setShippingSaved(false);
    try {
      const r = await adminApi.storeShipping.set(shipping);
      setShipping(r.shippingInr);
      setShippingSaved(true);
      setTimeout(() => setShippingSaved(false), 2500);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const startEdit = (p: Product) => {
    setEditing(p);
    setCreating(false);
    setForm({
      vendorPartnerId: p.vendorPartnerId,
      name: p.name,
      slug: p.slug,
      description: p.description,
      category: p.category,
      priceInr: p.priceInr,
      originalPriceInr: p.originalPriceInr,
      imageUrl: p.imageUrl,
      gallery: p.gallery ?? [],
      sizes: (p.sizes ?? []).join(", "),
      colors: (p.colors ?? []).join(", "),
      stock: p.stock,
      status: p.status,
      cgstPercent: p.cgstPercent ?? 0,
      sgstPercent: p.sgstPercent ?? 0,
    });
    setErr(null);
  };
  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ ...blank(), category: categories[0]?.slug ?? "apparel" });
    setErr(null);
  };
  const cancel = () => {
    setEditing(null);
    setCreating(false);
    setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const payload = {
        ...form,
        sizes: toList(form.sizes),
        colors: toList(form.colors),
      };
      if (creating) await adminApi.products.create(payload);
      else if (editing) await adminApi.products.update(editing.id, payload);
      load();
      cancel();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    await adminApi.products.remove(id);
    load();
  };

  const vendorName = (id: number) =>
    partners.find((p) => p.id === id)?.name ?? `#${id}`;

  const showForm = creating || !!editing;

  return (
    <AdminLayout
      title="Products"
      actions={
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-lime-500 to-lime-600 text-white text-sm font-medium shadow"
        >
          <Plus className="h-3.5 w-3.5" /> New Product
        </button>
      }
    >
      <AdminCard className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">
              Shipping charge per order (₹)
            </span>
            <input
              type="number"
              min={0}
              value={shipping}
              onChange={(e) => setShipping(Number(e.target.value))}
              className={INPUT + " mt-1 w-40"}
            />
          </label>
          <button
            onClick={saveShipping}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-lime-500 to-lime-600 text-white text-sm font-semibold"
          >
            Save shipping
          </button>
          {shippingSaved && (
            <span className="text-xs text-emerald-400 pb-2.5">Saved ✓</span>
          )}
          <p className="text-[11px] text-slate-400 basis-full">
            Added to every store order at checkout, on top of product prices and
            GST. Set 0 for free shipping.
          </p>
        </div>
      </AdminCard>

      {showForm && (
        <AdminCard className="p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">
              {creating ? "Add product" : `Edit: ${editing?.name}`}
            </h3>
            <button onClick={cancel} className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          {err && (
            <div className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {err}
            </div>
          )}
          <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-slate-400">Vendor (partner)</span>
              <select
                required
                value={form.vendorPartnerId || ""}
                onChange={(e) =>
                  setForm({ ...form, vendorPartnerId: Number(e.target.value) })
                }
                className={INPUT + " mt-1"}
              >
                <option value="" disabled>
                  Select vendor…
                </option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={INPUT + " mt-1"}
              >
                {categories.length === 0 ? (
                  <option value={form.category}>{form.category}</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={INPUT + " mt-1"}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Price (₹)</span>
              <input
                required
                type="number"
                value={form.priceInr}
                onChange={(e) =>
                  setForm({ ...form, priceInr: Number(e.target.value) })
                }
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">MRP (₹)</span>
              <input
                type="number"
                value={form.originalPriceInr}
                onChange={(e) =>
                  setForm({ ...form, originalPriceInr: Number(e.target.value) })
                }
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Stock</span>
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                className={INPUT + " mt-1"}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">CGST %</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                value={form.cgstPercent}
                onChange={(e) =>
                  setForm({ ...form, cgstPercent: Number(e.target.value) })
                }
                className={INPUT + " mt-1"}
                placeholder="e.g. 9"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">SGST %</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.01}
                value={form.sgstPercent}
                onChange={(e) =>
                  setForm({ ...form, sgstPercent: Number(e.target.value) })
                }
                className={INPUT + " mt-1"}
                placeholder="e.g. 9"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Sizes (comma separated)</span>
              <input
                value={form.sizes}
                onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                className={INPUT + " mt-1"}
                placeholder="S, M, L, XL"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">
                Colours (comma separated)
              </span>
              <input
                value={form.colors}
                onChange={(e) => setForm({ ...form, colors: e.target.value })}
                className={INPUT + " mt-1"}
                placeholder="Black, White, Lime"
              />
            </label>
            <div className="block md:col-span-2">
              <span className="text-xs text-slate-400">Main image</span>
              <div className="mt-1 flex items-center gap-3">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover border border-slate-700"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-slate-800 border border-slate-700" />
                )}
                <FileUpload
                  label="Upload photos"
                  multiple
                  onUploaded={(urls) =>
                    setForm((f) => {
                      if (urls.length === 0) return f;
                      const imageUrl = f.imageUrl || urls[0];
                      const extras = f.imageUrl ? urls : urls.slice(1);
                      return {
                        ...f,
                        imageUrl,
                        gallery: [...f.gallery, ...extras],
                      };
                    })
                  }
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Pick several photos at once — the first becomes the main image,
                the rest go to the gallery.
              </p>
              <input
                required
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className={INPUT + " mt-2"}
                placeholder="…or paste an image URL"
              />
            </div>
            <div className="block md:col-span-2">
              <span className="text-xs text-slate-400">Gallery images</span>
              {form.gallery.length > 0 && (
                <div className="flex flex-wrap gap-2 my-2">
                  {form.gallery.map((g, i) => (
                    <div key={`${g}-${i}`} className="relative">
                      <img
                        src={g}
                        alt=""
                        className="h-16 w-16 rounded-lg object-cover border border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            gallery: f.gallery.filter((_, j) => j !== i),
                          }))
                        }
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1">
                <FileUpload
                  label="Add gallery images"
                  multiple
                  onUploaded={(urls) =>
                    setForm((f) => ({ ...f, gallery: [...f.gallery, ...urls] }))
                  }
                />
              </div>
            </div>
            <label className="block md:col-span-2">
              <span className="text-xs text-slate-400">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={INPUT + " mt-1 resize-none"}
              />
            </label>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-lime-500 to-lime-600 text-white text-sm font-semibold"
              >
                {creating ? "Create product" : "Save changes"}
              </button>
            </div>
          </form>
        </AdminCard>
      )}

      <AdminCard className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No products yet. Click "New Product" to add one.
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-800/60 hover:bg-slate-800/30"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover bg-slate-800"
                      />
                      <div>
                        <div className="font-medium text-white">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">
                    {vendorName(p.vendorPartnerId)}
                  </td>
                  <td className="px-5 py-3 text-slate-400">{p.category}</td>
                  <td className="px-5 py-3 text-slate-300">
                    ₹{p.priceInr.toLocaleString("en-IN")}
                    {p.originalPriceInr > p.priceInr && (
                      <span className="ml-1 text-xs text-slate-500 line-through">
                        ₹{p.originalPriceInr}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-300">{p.stock}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === "active"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-700/40 text-slate-300 border border-slate-600/40"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => startEdit(p)}
                      className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </AdminCard>
    </AdminLayout>
  );
}
