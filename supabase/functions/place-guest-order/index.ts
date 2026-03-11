import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { guest_details, items, coupon_code, discount_amount, payment_method } = body;

    if (!guest_details || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate totals from DB prices to prevent price tampering
    const productIds = items.map((i: any) => i.product_id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price")
      .in("id", productIds);

    if (prodErr || !products) {
      return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const productMap = new Map(products.map((p: any) => [p.id, p]));
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;
      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;
      orderItems.push({
        product_id: item.product_id,
        product_name: product.name,
        product_price: product.price,
        quantity: item.quantity,
        total_price: itemTotal,
      });
    }

    const finalDiscount = Math.min(discount_amount || 0, subtotal);
    const totalAmount = subtotal - finalDiscount;

    // Generate order number
    const orderNumber = `ELA${Date.now().toString().slice(-8)}`;

    // Create a guest user placeholder or use anonymous UUID
    const guestUserId = "00000000-0000-0000-0000-000000000000";

    // Check if guest placeholder user exists, create if not
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", guestUserId)
      .maybeSingle();

    if (!existingProfile) {
      // Create the guest user in auth and profile
      const { error: authErr } = await supabase.auth.admin.createUser({
        email: "guest@elafoods.local",
        password: "guest_placeholder_never_login_2026",
        email_confirm: true,
        user_metadata: { full_name: "Guest User" },
      });
      // If auth user creation fails (already exists etc), try to just ensure profile exists
      if (authErr) {
        console.log("Guest auth user may already exist:", authErr.message);
      }
      
      // Upsert profile for guest
      await supabase.from("profiles").upsert({
        id: guestUserId,
        email: "guest@elafoods.local",
        full_name: "Guest User",
      }, { onConflict: "id" });

      // Ensure wallet exists
      await supabase.from("wallets").upsert({
        user_id: guestUserId,
        balance: 0,
      }, { onConflict: "user_id" });
    }

    // Insert order using service role (bypasses RLS)
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: guestUserId,
        order_number: orderNumber,
        status: "pending",
        payment_status: "pending",
        subtotal,
        shipping_amount: 0,
        discount_amount: finalDiscount,
        wallet_amount_used: 0,
        total_amount: totalAmount,
        coupon_code: coupon_code || null,
        is_cod: payment_method === "cod",
        cod_amount: payment_method === "cod" ? totalAmount : 0,
        notes: `Guest Order - Phone: ${guest_details.phone}, Name: ${guest_details.full_name}`,
        shipping_address: {
          full_name: guest_details.full_name,
          email: guest_details.email || "",
          phone: guest_details.phone,
          address_line1: guest_details.address_line1,
          address_line2: guest_details.address_line2 || "",
          city: guest_details.city,
          state: guest_details.state,
          postal_code: guest_details.postal_code,
          country: "India",
          is_guest: true,
        },
      })
      .select()
      .single();

    if (orderErr) {
      console.error("Order insert error:", orderErr);
      return new Response(JSON.stringify({ error: "Failed to create order" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map((i: any) => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsWithOrderId);

    if (itemsErr) {
      console.error("Order items insert error:", itemsErr);
    }

    // Update coupon usage if applied
    if (coupon_code) {
      await supabase
        .from("coupons")
        .update({ usage_count: supabase.rpc ? undefined : 0 })
        .eq("code", coupon_code);
      
      // Increment usage count
      const { data: coupon } = await supabase
        .from("coupons")
        .select("usage_count")
        .eq("code", coupon_code)
        .single();
      
      if (coupon) {
        await supabase
          .from("coupons")
          .update({ usage_count: (coupon.usage_count || 0) + 1 })
          .eq("code", coupon_code);
      }
    }

    return new Response(
      JSON.stringify({ success: true, order_number: orderNumber, order_id: order.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Guest order error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
