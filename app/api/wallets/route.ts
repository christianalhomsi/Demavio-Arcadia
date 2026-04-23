import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getWalletWithBalance, addWalletTopUp, getOrCreateWallet } from "@/services";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");
  const username = searchParams.get("username");
  const guestName = searchParams.get("guest_name");

  if (!hallId) {
    return NextResponse.json({ error: "hall_id required" }, { status: 400 });
  }

  if (!username && !guestName) {
    return NextResponse.json({ error: "username or guest_name required" }, { status: 400 });
  }

  // If username provided, get user_id first
  let userId: string | null = null;
  if (username) {
    const supabase = await getServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    userId = profile.id;
  }

  const result = await getWalletWithBalance(hallId, userId, guestName);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.hall_id || (!body?.username && !body?.guest_name) || !body?.amount) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { hall_id, username, guest_name, amount, note } = body;

  if (amount <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  // Verify authenticated staff
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If username provided, get user_id
  let userId: string | null = null;
  if (username) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    userId = profile.id;
  }

  // Get or create wallet
  const walletResult = await getOrCreateWallet(hall_id, userId, guest_name);
  if (!walletResult.success) {
    return NextResponse.json({ error: walletResult.error }, { status: 500 });
  }

  // Add top-up transaction
  const topUpResult = await addWalletTopUp(walletResult.data.id, amount, user.id, note);
  if (!topUpResult.success) {
    return NextResponse.json({ error: topUpResult.error }, { status: 500 });
  }

  return NextResponse.json(topUpResult.data, { status: 201 });
}
