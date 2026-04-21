import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess, getHallProducts, createProduct, updateProduct } from "@/services";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().min(0),
  is_active: z.boolean().optional(),
});

// GET /api/products?hall_id=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");

  if (!hallId) {
    return NextResponse.json({ error: "hall_id is required" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResult = await verifyStaffHallAccess(user.id, hallId);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await getHallProducts(hallId, false);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
}

// POST /api/products
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");

  if (!hallId) {
    return NextResponse.json({ error: "hall_id is required" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessResult = await verifyStaffHallAccess(user.id, hallId);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await createProduct(hallId, parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data, { status: 201 });
}

// PATCH /api/products?product_id=xxx
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  
  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");

  if (!productId) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify product belongs to a hall the user has access to
  const { data: product } = await supabase
    .from("products")
    .select("hall_id")
    .eq("id", productId)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const accessResult = await verifyStaffHallAccess(user.id, product.hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await updateProduct(productId, parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
}
