"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ShoppingCart, Plus, Trash2, Clock, DollarSign, X, Wallet } from "lucide-react";
import type { Product } from "@/types/product";
import type { SessionItem } from "@/types/session-item";
import type { WalletWithBalance } from "@/types/wallet";

type SessionModalProps = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  deviceId: string;
  deviceName: string;
  hallId: string;
  startedAt: string;
  userId: string | null;
  guestName: string | null;
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
  deviceId,
  deviceName,
  hallId,
  startedAt,
  userId,
  guestName,
  onSessionEnd,
}: SessionModalProps) {
  const t = useTranslations("session");
  const tc = useTranslations("common");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ratePerHour, setRatePerHour] = useState("");
  const [walletPricePerHour, setWalletPricePerHour] = useState("");
  const [wallet, setWallet] = useState<WalletWithBalance | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash');
  
  const storageKey = `session-${sessionId}-items`;
  
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");

  useEffect(() => {
    if (open) {
      loadData();
      loadFromLocalStorage();
      loadWallet();
      loadDevicePrice();
    }
  }, [open, sessionId]);

  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.items) {
          setSessionItems(parsed.items);
        }
        if (parsed.rate) {
          setRatePerHour(parsed.rate);
        }
      }
    } catch (e) {
      console.error("Failed to load from localStorage", e);
    }
  }

  useEffect(() => {
    if (sessionItems.length > 0 || ratePerHour) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ items: sessionItems, rate: ratePerHour }));
      } catch (e) {
        console.error("Failed to save to localStorage", e);
      }
    }
  }, [sessionItems, ratePerHour, storageKey]);

  async function loadDevicePrice() {
    try {
      const res = await fetch(`/api/devices/${deviceId}/price?hall_id=${hallId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.price_per_hour && !ratePerHour) {
          setRatePerHour(data.price_per_hour.toString());
        }
      }
    } catch (e) {
      console.error("Failed to load device price", e);
    }
  }

  async function loadData() {
    setLoading(true);
    
    const productsRes = await fetch(`/api/products?hall_id=${hallId}`);
    if (productsRes.ok) {
      const data = await productsRes.json();
      setProducts(data.filter((p: Product) => p.is_active));
    }

    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      const itemsRes = await fetch(`/api/session-items?session_id=${sessionId}`);
      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setSessionItems(data);
      }
    }

    setLoading(false);
  }

  async function loadWallet() {
    if (!userId && !guestName) return;

    const supabase = await fetch('/api/auth/session').then(r => r.json());
    
    // Get username if userId exists
    let username: string | null = null;
    if (userId) {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const user = await res.json();
        username = user.username;
      }
    }

    const params = new URLSearchParams({ hall_id: hallId });
    if (username) params.append("username", username);
    if (guestName) params.append("guest_name", guestName);

    const res = await fetch(`/api/wallets?${params}`);
    if (res.ok) {
      const data = await res.json();
      setWallet(data);
    }
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
      await updateInvoice();
      toast.success(t("itemAdded"));
    } else {
      toast.error(t("failedToAddItem"));
    }
  }

  async function addManualItem() {
    const price = parseFloat(manualPrice);
    const quantity = parseInt(manualQuantity);

    if (!manualName || !price || price < 0 || !quantity || quantity < 1) {
      toast.error(t("fillAllFields"));
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
      await updateInvoice();
      toast.success(t("itemAdded"));
    } else {
      toast.error(t("failedToAddItem"));
    }
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/session-items?item_id=${itemId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      const updatedItems = sessionItems.filter((item) => item.id !== itemId);
      setSessionItems(updatedItems);
      toast.success(t("itemRemoved"));
    } else {
      toast.error(t("failedToRemoveItem"));
    }
  }

  async function updateInvoice() {
    // Update invoice with current items
    await fetch(`/api/invoices/${sessionId}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: sessionItems.map(item => ({
          id: item.id,
          product_name: item.product_name,
          product_price: item.product_price,
          quantity: item.quantity,
        })),
      }),
    });
  }

  async function confirmPayment() {
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) {
      toast.error(t("enterValidRate"));
      return;
    }

    if (paymentMethod === 'wallet') {
      const walletRate = parseFloat(walletPricePerHour) || rate;
      const sessionCost = walletRate * durationHours;
      
      if (!wallet || wallet.balance < sessionCost) {
        toast.error(t("insufficientBalance"));
        return;
      }
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          hall_id: hallId, 
          rate_per_hour: rate,
          payment_method: paymentMethod,
          wallet_price_per_hour: walletPricePerHour ? parseFloat(walletPricePerHour) : undefined,
        }),
      });

      if (res.ok) {
        localStorage.removeItem(storageKey);
        toast.success(t("paymentConfirmed"));
        onSessionEnd();
        onClose();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(json?.error ?? t("failedToEndSession"));
      }
    } catch (error) {
      toast.error(t("failedToEndSession"));
    }
  }

  const itemsTotal = sessionItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity,
    0
  );

  const durationHours = (Date.now() - new Date(startedAt).getTime()) / (1000 * 60 * 60);
  const effectiveRate = paymentMethod === 'wallet' && walletPricePerHour 
    ? parseFloat(walletPricePerHour) 
    : parseFloat(ratePerHour);
  const sessionCost = effectiveRate * durationHours || 0;
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
          <div className="flex items-center gap-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Clock size={16} className="text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              {t("duration")}: {elapsed(startedAt)}
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("quickAddProducts")}</Label>
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
                    {product.price.toFixed(0)} {t("syrianPound")}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {!showManualEntry ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowManualEntry(true)}
                className="w-full"
              >
                <Plus size={14} className="mr-1" />
                {t("addCustomItem")}
              </Button>
            ) : (
              <div className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t("customItem")}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowManualEntry(false)}
                  >
                    <X size={14} />
                  </Button>
                </div>
                <Input
                  placeholder={t("itemName")}
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder={t("price")}
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="h-8 text-sm"
                    min="0"
                    step="1"
                  />
                  <Input
                    type="number"
                    placeholder={t("qty")}
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
                  {t("addItem")}
                </Button>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("sessionItems")}</Label>
            {sessionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("noItems")}
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
                        {item.product_price.toFixed(0)} {t("syrianPound")} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {(item.product_price * item.quantity).toFixed(0)} {t("syrianPound")}
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

          {wallet && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-green-400" />
                  <span className="text-sm font-medium text-green-400">{t("walletBalance")}</span>
                </div>
                <span className="text-sm font-bold text-green-400">{wallet.balance.toFixed(0)} {t("syrianPound")}</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-sm">{t("cashRatePerHour")}</Label>
            <Input
              type="number"
              placeholder="5000"
              value={ratePerHour}
              onChange={(e) => setRatePerHour(e.target.value)}
              className="h-9"
              min="0"
              step="100"
            />
          </div>

          {wallet && (
            <div className="space-y-1">
              <Label className="text-sm">{t("walletRatePerHour")}</Label>
              <Input
                type="number"
                placeholder={t("leaveEmptyToUseCashRate")}
                value={walletPricePerHour}
                onChange={(e) => setWalletPricePerHour(e.target.value)}
                className="h-9"
                min="0"
                step="100"
              />
            </div>
          )}

          {wallet && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t("paymentMethod")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('cash')}
                  className="h-12"
                >
                  <DollarSign size={16} className="mr-1" />
                  {t("fullCash")}
                </Button>
                <Button
                  type="button"
                  variant={paymentMethod === 'wallet' ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod('wallet')}
                  className="h-12"
                  disabled={!wallet || wallet.balance < sessionCost}
                >
                  <Wallet size={16} className="mr-1" />
                  {t("walletAndCash")}
                </Button>
              </div>
              {paymentMethod === 'wallet' && (
                <p className="text-xs text-muted-foreground">
                  {t("sessionPaidFromWallet")}
                </p>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex justify-between text-sm">
              <span>{t("sessionCost")} ({durationHours.toFixed(2)}h)</span>
              <div className="flex items-center gap-2">
                <span>{sessionCost.toFixed(0)} {t("syrianPound")}</span>
                {paymentMethod === 'wallet' && (
                  <span className="text-xs text-green-400">({t("walletBalance")})</span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t("items")} ({sessionItems.length})</span>
              <span>{itemsTotal.toFixed(0)} {t("syrianPound")}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>{t("total")}</span>
              <span className="text-primary">{grandTotal.toFixed(0)} {t("syrianPound")}</span>
            </div>
            {paymentMethod === 'wallet' && (
              <p className="text-xs text-muted-foreground">
                {t("cashToCollect")} {itemsTotal.toFixed(0)} {t("syrianPound")}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={confirmPayment}
              disabled={!ratePerHour}
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            >
              <DollarSign size={14} className="mr-1" />
              {t("confirmPayment")}
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
