import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 10;
  const offset = (page - 1) * limit;

  if (!hallId) {
    return NextResponse.json({ error: "hall_id required" }, { status: 400 });
  }

  const supabase = await getServerClient();

  const { data: wallets, error } = await supabase
    .from("player_wallets")
    .select("*, profiles(username)")
    .eq("hall_id", hallId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const walletsWithBalance = await Promise.all(
    (wallets || []).map(async (wallet) => {
      const { data: balance } = await supabase.rpc("get_wallet_balance", {
        wallet_uuid: wallet.id,
      });

      return {
        ...wallet,
        balance: parseFloat(balance || "0"),
        username: wallet.profiles?.username || null,
      };
    })
  );

  const { count } = await supabase
    .from("player_wallets")
    .select("*", { count: "exact", head: true })
    .eq("hall_id", hallId);

  return NextResponse.json({
    wallets: walletsWithBalance,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
