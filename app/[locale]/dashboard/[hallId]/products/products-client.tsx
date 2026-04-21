"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Check, X, Package } from "lucide-react";
import type { Product } from "@/types/product";

export default function ProductsClient({ hallId }: { hallId: string }) {
  const t = useTranslations("products");
  const tc = useTranslations("common");
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Add Button */}
      {!showAddForm && !editingId && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowAddForm(true)}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            className="gap-2"
          >
            <Plus size={16} />
            {t("addProduct")}
          </Button>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-border/60">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("newProduct")}</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setName("");
                  setPrice("");
                }}
              >
                <X size={16} />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t("productName")}</Label>
                <Input
                  placeholder={t("productName")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t("price")}</Label>
                <Input
                  type="number"
                  placeholder={t("price")}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <Button
              onClick={handleAdd}
              className="w-full"
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            >
              <Check size={16} className="mr-2" />
              {t("add")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Products List */}
      {products.length === 0 ? (
        <Card className="border-border/60 border-dashed">
          <CardContent className="py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "2px dashed oklch(0.55 0.26 280 / 0.3)" }}
            >
              <Package size={32} style={{ color: "oklch(0.65 0.22 280)" }} className="opacity-50" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">{t("noProducts")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card
              key={product.id}
              className={`border-border/60 ${
                !product.is_active ? "opacity-60" : ""
              }`}
            >
              <CardContent className="pt-6">
                {editingId === product.id ? (
                  <div className="space-y-3">
                    <Input
                      placeholder={t("productName")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      placeholder={t("price")}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="text-sm"
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
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold truncate">{product.name}</h4>
                        <p className="text-2xl font-bold mt-1" style={{ color: "oklch(0.65 0.22 280)" }}>
                          ${product.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-1">
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
                    {!product.is_active && (
                      <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                        Inactive
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
