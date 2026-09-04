import {
  useListMyStoreOrders,
  getListMyStoreOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Payment pending",
  payment_failed: "Payment failed",
  placed: "Placed",
  confirmed: "Confirmed",
  processing: "Being prepared",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  payment_pending: "bg-yellow-500/15 text-yellow-600",
  payment_failed: "bg-red-500/15 text-red-600",
  placed: "bg-blue-500/15 text-blue-600",
  confirmed: "bg-blue-500/15 text-blue-600",
  processing: "bg-amber-500/15 text-amber-600",
  shipped: "bg-purple-500/15 text-purple-600",
  delivered: "bg-green-500/15 text-green-600",
  cancelled: "bg-red-500/15 text-red-600",
};

export default function Orders() {
  const { data: orders, isLoading, isError } = useListMyStoreOrders({
    query: { queryKey: getListMyStoreOrdersQueryKey() },
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">My Orders</h1>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Please sign in to see your orders.
          </CardContent>
        </Card>
      )}
      {orders && orders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">You haven't placed any orders yet.</p>
            <Link href="/store">
              <Button>Browse the store</Button>
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {orders?.map((o) => (
          <Card key={o.id}>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">Order #{o.id}</span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className={STATUS_COLORS[o.status] ?? ""}
                >
                  {STATUS_LABELS[o.status] ?? o.status}
                </Badge>
              </div>
              <div className="space-y-1 text-sm">
                {o.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {it.productName}
                      {it.variant ? ` (${it.variant})` : ""} × {it.qty}
                    </span>
                    <span>₹{it.unitPriceInr * it.qty}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
                <span>Total paid</span>
                <span>₹{o.totalInr}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
