"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ShoppingCart, Plus, Trash2, Clock, DollarSign, X } from "lucide-react";
import type { Product } from "@/types/product";
import type { SessionItem } from "@/types/session-item";

type SessionModalProps = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  deviceName: string;
  hallId: string;
  startedAt: string;
  onSessionEnd: () => void;
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function SessionModal({
  open,
  onClose,
  sessionId,
  deviceName,
  hallId,
  startedAt,
  onSessionEnd,
}: SessionModalProps) {
  const t = useTranslations("session");
  const tc = useTranslations("common");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ratePerHour, setRatePerHour] = useState("");
  
  // Manual entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, sessionId]);

  async function loadData() {
    setLoading(true);
    
    // Load products and session items in parallel
    const [productsRes, itemsRes] = await Promise.all([
      fetch(`/api/products?hall_id=${hallId}`),
      fetch(`/api/session-items?session_id=${sessionId}`),
    ]);

    if (productsRes.ok) {
      const data = await productsRes.json();
      setProducts(data.filter((p: Product) => p.is_active));
    }

    if (itemsRes.ok) {
      const data = await itemsRes.json();
      setSessionItems(data);
    }

    setLoading(false);
  }

  async function addProduct(product: Product) {
    const res = await fetch("/api/session-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        quantity: 1,
      }),
    });

    if (res.ok) {
      const newItem = await res.json();
      setSessionItems([...sessionItems, newItem]);
      toast.success(`${product.name} added`);
    } else {
      toast.error("Failed to add item");
    }
  }

  async function addManualItem() {
    const price = parseFloat(manualPrice);
    const quantity = parseInt(manualQuantity);

    if (!manualName || !price || price < 0 || !quantity || quantity < 1) {
      toast.error("Please fill all fields correctly");
      return;
    }

    const res = await fetch("/api/session-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        product_id: null,
        product_name: manualName,
        product_price: price,
        quantity: quantity,
      }),
    });

    if (res.ok) {
      const newItem = await res.json();
      setSessionItems([...sessionItems, newItem]);
      setManualName("");
      setManualPrice("");
      setManualQuantity("1");
      setShowManualEntry(false);
      toast.success("Item added");
    } else {
      toast.error("Failed to add item");
    }
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/session-items?item_id=${itemId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setSessionItems(sessionItems.filter((item) => item.id !== itemId));
      toast.success("Item removed");
    } else {
      toast.error("Failed to remove item");
    }
  }

  async function confirmPayment() {
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) {
      toast.error("Enter valid rate per hour");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/sessions/${sessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hall_id: hallId, rate_per_hour: rate }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("Payment confirmed");
      onSessionEnd();
      onClose();
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? "Failed to end session");
    }
  }

  const itemsTotal = sessionItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity,
    0
  );

  const durationHours = (Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60);
  const sessionCost = parseFloat(ratePerHour) * durationHours || 0;
  const grandTotal = sessionCost + itemsTotal;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart size={18} />
            {deviceName} - Session
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Session Info */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Clock size={16} className="text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              Duration: {elapsed(startedAt)}
            </span>
          </div>

          {/* Products Catalog */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Quick Add Products</Label>
            <div className="grid grid-cols-2 gap-2">
              {products.map((product) => (
                <Button
                  key={product.id}
                  size="sm"
                  variant="outline"
                  onClick={() => addProduct(product)}
                  className="justify-between"
                >
                  <span className="truncate">{product.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ${product.price.toFixed(2)}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Manual Entry */}
          <div className="space-y-2">
            {!showManualEntry ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowManualEntry(true)}
                className="w-full"
              >
                <Plus size={14} className="mr-1" />
                Add Custom Item
              </Button>
            ) : (
              <div className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Custom Item</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowManualEntry(false)}
                  >
                    <X size={14} />
                  </Button>
                </div>
                <Input
                  placeholder="Item name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Price"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="h-8 text-sm"
                    min="0"
                    step="0.01"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={manualQuantity}
                    onChange={(e) => setManualQuantity(e.target.value)}
                    className="h-8 text-sm"
                    min="1"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={addManualItem}
                  className="w-full"
                  style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                >
                  Add Item
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Cart */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Session Items</Label>
            {sessionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No items added yet
              </p>
            ) : (
              <div className="space-y-1">
                {sessionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${item.product_price.toFixed(2)} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        ${(item.product_price * item.quantity).toFixed(2)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="h-7 w-7 p-0"
                      >
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Rate Input */}
          <div className="space-y-1">
            <Label className="text-sm">Rate per Hour ($)</Label>
            <Input
              type="number"
              placeholder="e.g. 5.00"
              value={ratePerHour}
              onChange={(e) => setRatePerHour(e.target.value)}
              className="h-9"
              min="0"
              step="0.01"
            />
          </div>

          {/* Total Breakdown */}
          <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex justify-between text-sm">
              <span>Session ({durationHours.toFixed(2)}h)</span>
              <span>${sessionCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Items ({sessionItems.length})</span>
              <span>${itemsTotal.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="text-primary">${grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={confirmPayment}
              disabled={loading || !ratePerHour}
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            >
              <DollarSign size={14} className="mr-1" />
              {loading ? "Processing..." : "Confirm Payment"}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              {tc("cancel")}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
