import { useEffect, useState } from "react";
import { AdminLayout, AdminCard } from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/adminApi";
import { ShoppingBag } from "lucide-react";

type OrderItem = {
  id: number;
  productId: number;
  vendorPartnerId: number;
  productName: string;
  unitPriceInr: number;
  qty: number;
};
type Order = {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPincode: string;
  totalInr: number;
  pointsRedeemedInr?: number;
  subtotalInr?: number;
  cgstInr?: number;
  sgstInr?: number;
  shippingInr?: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
};

const STATUSES = [
  "payment_pending",
  "payment_failed",
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

export default function AdminOrders() {
  const [rows, setRows] = useState<Order[]>([]);

  const load = () => {
    adminApi.orders.list().then((r) => setRows(r as Order[]));
  };
  useEffect(load, []);

  const updateStatus = async (id: number, status: string) => {
    await adminApi.orders.update(id, { status });
    load();
  };

  return (
    <AdminLayout title="Orders">
      {rows.length === 0 ? (
        <AdminCard className="p-12 text-center text-slate-500">
          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No orders yet.
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <AdminCard key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-slate-500">
                    Order #{o.id} ·{" "}
                    {new Date(o.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                  <div className="mt-0.5 font-bold text-white">
                    {o.customerName}
                  </div>
                  <div className="text-xs text-slate-400">
                    {o.customerPhone} · {o.customerEmail}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 max-w-md">
                    {o.shippingAddress}, {o.shippingCity} — {o.shippingPincode}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-white">
                    ₹{o.totalInr.toLocaleString("en-IN")}
                  </div>
                  {(o.subtotalInr ?? 0) > 0 && (
                    <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                      <div>Subtotal ₹{(o.subtotalInr ?? 0).toLocaleString("en-IN")}</div>
                      {(o.cgstInr ?? 0) > 0 && <div>CGST ₹{o.cgstInr}</div>}
                      {(o.sgstInr ?? 0) > 0 && <div>SGST ₹{o.sgstInr}</div>}
                      {(o.shippingInr ?? 0) > 0 && (
                        <div>Shipping ₹{o.shippingInr}</div>
                      )}
                      {(o.pointsRedeemedInr ?? 0) > 0 && (
                        <div>Points −₹{o.pointsRedeemedInr}</div>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                    {o.paymentMethod}
                  </div>
                  <select
                    value={o.status}
                    onChange={(e) => updateStatus(o.id, e.target.value)}
                    className="mt-2 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 grid sm:grid-cols-2 gap-2 text-sm">
                {o.items.map((i) => (
                  <div
                    key={i.id}
                    className="flex justify-between text-slate-300"
                  >
                    <span>
                      {i.productName}{" "}
                      <span className="text-slate-500">× {i.qty}</span>
                    </span>
                    <span className="text-slate-400">
                      ₹{(i.unitPriceInr * i.qty).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </AdminCard>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
