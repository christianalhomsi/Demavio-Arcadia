"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Package, Plus, Edit2, Trash2, Check, X } from "lucide-react";
import type { Product } from "@/types/product";

export default function ProductsSection({ hallId }: { hallId: string }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    loadProducts();
  }, [hallId]);

  async function loadProducts() {
    setLoading(true);
    const res = await fetch(`/api/products?hall_id=${hallId}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data);
    }
    setLoading(false);
  }

  async function handleAdd() {
    const priceNum = parseFloat(price);
    if (!name || !priceNum || priceNum < 0) {
      toast.error("Please fill all fields correctly");
      return;
    }

    const res = await fetch(`/api/products?hall_id=${hallId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price: priceNum, is_active: true }),
    });

    if (res.ok) {
      const newProduct = await res.json();
      setProducts([...products, newProduct]);
      setName("");
      setPrice("");
      setShowAddForm(false);
      toast.success("Product added");
    } else {
      toast.error("Failed to add product");
    }
  }

  async function handleEdit(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setPrice(product.price.toString());
  }

  async function handleUpdate(productId: string) {
    const priceNum = parseFloat(price);
    if (!name || !priceNum || priceNum < 0) {
      toast.error("Please fill all fields correctly");
      return;
    }

    const res = await fetch(`/api/products?product_id=${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price: priceNum }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProducts(products.map((p) => (p.id === productId ? updated : p)));
      setEditingId(null);
      setName("");
      setPrice("");
      toast.success("Product updated");
    } else {
      toast.error("Failed to update product");
    }
  }

  async function toggleActive(product: Product) {
    const res = await fetch(`/api/products?product_id=${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !product.is_active }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProducts(products.map((p) => (p.id === product.id ? updated : p)));
      toast.success(updated.is_active ? "Product activated" : "Product deactivated");
    } else {
      toast.error("Failed to update product");
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setPrice("");
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-muted-foreground" />
            <CardTitle className="text-base">{t("title")}</CardTitle>
          </div>
          {!showAddForm && !editingId && (
            <Button
              size="sm"
              onClick={() => setShowAddForm(true)}
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            >
              <Plus size={14} className="mr-1" />
              {t("addProduct")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("description")}</p>
      </CardHeader>

      <Separator className="opacity-40" />

      <CardContent className="pt-4 space-y-3">
        {/* Add Form */}
        {showAddForm && (
          <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t("newProduct")}</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setName("");
                  setPrice("");
                }}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="space-y-2">
              <Input
                placeholder={t("productName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
              />
              <Input
                type="number"
                placeholder={t("price")}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9"
                min="0"
                step="0.01"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              className="w-full"
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            >
              <Check size={14} className="mr-1" />
              {t("add")}
            </Button>
          </div>
        )}

        {/* Products List */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {tc("loading")}
          </p>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("noProducts")}
          </p>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.id}
                className={`p-3 rounded-lg border ${
                  product.is_active
                    ? "bg-card border-border/60"
                    : "bg-muted/50 border-border/40 opacity-60"
                }`}
              >
                {editingId === product.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder={t("productName")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      placeholder={t("price")}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="h-8 text-sm"
                      min="0"
                      step="0.01"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(product.id)}
                        className="flex-1"
                        style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                      >
                        <Check size={14} className="mr-1" />
                        {tc("save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        className="flex-1"
                      >
                        <X size={14} className="mr-1" />
                        {tc("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${product.price.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(product)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(product)}
                        className="h-8 w-8 p-0"
                      >
                        {product.is_active ? (
                          <Trash2 size={14} className="text-destructive" />
                        ) : (
                          <Check size={14} className="text-green-500" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
