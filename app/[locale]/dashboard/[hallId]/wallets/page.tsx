"use client";

import { useState, use, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wallet, Plus, Search, User, Users, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { WalletWithBalance } from "@/types/wallet";

export default function WalletsPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = use(params);
  const tw = useTranslations("wallets");
  const tc = useTranslations("common");

  const [allWallets, setAllWallets] = useState<(WalletWithBalance & { username?: string })[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<(WalletWithBalance & { username?: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [playerType, setPlayerType] = useState<"user" | "guest">("guest");
  const [playerIdentifier, setPlayerIdentifier] = useState("");

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpNote, setTopUpNote] = useState("");

  useEffect(() => {
    loadAllWallets();
  }, [page]);

  async function loadAllWallets() {
    setLoading(true);
    const res = await fetch(`/api/wallets/list?hall_id=${hallId}&page=${page}`);
    if (res.ok) {
      const data = await res.json();
      setAllWallets(data.wallets);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }

  async function searchWallet() {
    if (!playerIdentifier.trim()) {
      toast.error(playerType === "user" ? tw("enterUsername") : tw("enterGuestName"));
      return;
    }

    setLoading(true);
    const queryParams = new URLSearchParams({ hall_id: hallId });

    if (playerType === "user") {
      queryParams.append("username", playerIdentifier);
    } else {
      queryParams.append("guest_name", playerIdentifier);
    }

    const res = await fetch(`/api/wallets?${queryParams}`);
    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setSelectedWallet({ ...data, username: playerIdentifier });
      setShowTopUp(false);
      toast.success(tw("walletFound"));
    } else if (res.status === 404) {
      setSelectedWallet({
        id: "",
        hall_id: hallId,
        user_id: playerType === "user" ? "pending" : null,
        guest_name: playerType === "guest" ? playerIdentifier : null,
        balance: 0,
        created_at: "",
        updated_at: "",
        username: playerType === "user" ? playerIdentifier : undefined,
      } as any);
      setShowTopUp(true);
      toast.info(tw("walletNotFound"));
    } else {
      toast.error(tw("errorLoading"));
    }
  }

  async function handleTopUp(wallet: WalletWithBalance & { username?: string }) {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error(tw("enterValidAmount"));
      return;
    }

    setLoading(true);
    const res = await fetch("/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hall_id: hallId,
        username: wallet.user_id ? (wallet.username || playerIdentifier) : undefined,
        guest_name: wallet.guest_name,
        amount,
        note: topUpNote || undefined,
      }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success(wallet.id === "" ? tw("walletCreated") : tw("walletToppedUp"));
      setTopUpAmount("");
      setTopUpNote("");
      setShowTopUp(false);
      setSelectedWallet(null);
      loadAllWallets();
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? tw("topUpFailed"));
    }
  }

  function selectWallet(wallet: WalletWithBalance & { username?: string }) {
    setSelectedWallet(wallet);
    setShowTopUp(false);
    setPlayerIdentifier(wallet.username || wallet.guest_name || "");
  }

  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5 mb-6">
        <Wallet size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{tw("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tw("description")}</p>
        </div>
      </div>

      {/* Search Section */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-sm font-semibold">{tw("searchWallet")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={playerType === "guest" ? "default" : "outline"}
              onClick={() => setPlayerType("guest")}
              className="h-12"
            >
              <Users size={16} className="mr-1" />
              {tw("guestPlayer")}
            </Button>
            <Button
              variant={playerType === "user" ? "default" : "outline"}
              onClick={() => setPlayerType("user")}
              className="h-12"
            >
              <User size={16} className="mr-1" />
              {tw("registeredPlayer")}
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder={playerType === "user" ? tw("usernamePlaceholder") : tw("guestNamePlaceholder")}
              value={playerIdentifier}
              onChange={(e) => setPlayerIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchWallet()}
            />
            <Button onClick={searchWallet} disabled={loading}>
              <Search size={16} className="mr-1" />
              {tc("search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Selected Wallet for Top Up */}
      {selectedWallet && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-sm font-semibold">{tw("selectedWallet")}</h2>
          </CardHeader>
          <CardContent>
            <div className="p-4 border rounded-lg space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {selectedWallet.user_id ? <User size={16} /> : <Users size={16} />}
                    <p className="text-sm font-medium">
                      {selectedWallet.user_id ? tw("registeredPlayer") : tw("guestPlayer")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedWallet.username || selectedWallet.guest_name}
                  </p>
                  {selectedWallet.id === "" && (
                    <p className="text-xs text-orange-500 font-medium mt-1">
                      ⚠️ {tw("newWallet")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-green-500">
                    {selectedWallet.balance.toLocaleString('ar-SY')} ل.س
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{tw("currentBalance")}</p>
                </div>
              </div>

              <Separator />

              {!showTopUp ? (
                <Button
                  onClick={() => setShowTopUp(true)}
                  className="w-full h-12"
                  style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                >
                  <Plus size={16} className="mr-2" />
                  {tw("topUpWallet")}
                </Button>
              ) : (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-sm">{tw("amount")}</Label>
                    <Input
                      type="number"
                      placeholder={tw("amountPlaceholder")}
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      min="0"
                      step="1000"
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm">{tw("note")}</Label>
                    <Input
                      placeholder={tw("notePlaceholder")}
                      value={topUpNote}
                      onChange={(e) => setTopUpNote(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleTopUp(selectedWallet)}
                      disabled={loading || !topUpAmount}
                      className="flex-1"
                      style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                    >
                      <DollarSign size={16} className="mr-1" />
                      {selectedWallet.id === "" ? tw("createAndAdd") : tw("add")} {parseFloat(topUpAmount || "0").toLocaleString('ar-SY')} ل.س
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowTopUp(false);
                        setSelectedWallet(null);
                      }}
                      className="flex-1"
                    >
                      {tc("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Wallets List */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">{tw("allWallets")}</h2>
        </CardHeader>
        <CardContent>
          {loading && allWallets.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{tc("loading")}</p>
          ) : allWallets.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{tw("noWallets")}</p>
          ) : (
            <>
              <div className="space-y-2">
                {allWallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => selectWallet(wallet)}
                  >
                    <div className="flex items-center gap-3">
                      {wallet.user_id ? <User size={16} /> : <Users size={16} />}
                      <div>
                        <p className="text-sm font-medium">
                          {wallet.username || wallet.guest_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {wallet.user_id ? tw("registeredPlayer") : tw("guestPlayer")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-500">
                        {wallet.balance.toLocaleString('ar-SY')} ل.س
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
