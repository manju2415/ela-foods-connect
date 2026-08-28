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
    const { guest_details, items, coupon_code, discount_amount, payment_method, payment_reference } = body;

    // A successful Razorpay payment reference is the source of truth. Older
    // published clients may omit payment_method or send "razorpay", so do not
    // reject an otherwise paid order based on that display value.
    if (typeof payment_reference !== "string" || !payment_reference.trim()) {
      console.warn("Rejected unpaid guest order request", {
        payment_method: payment_method || null,
        has_payment_reference: false,
      });
      return new Response(JSON.stringify({ error: "Verified online payment is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!guest_details || !Array.isArray(items) || items.length === 0) {
      console.warn("Rejected incomplete guest order request", {
        has_guest_details: Boolean(guest_details),
        item_count: Array.isArray(items) ? items.length : 0,
      });
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

    // Fetch shipping settings
    let shippingAmount = 0;
    const { data: shippingSettingsRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "shipping_settings")
      .maybeSingle();

    if (shippingSettingsRow?.value) {
      const ss = shippingSettingsRow.value as any;
      const flatRate = ss.flat_rate ?? 50;
      const enableFreeShipping = ss.enable_free_shipping ?? true;
      const freeThreshold = ss.free_shipping_threshold ?? 500;
      if (enableFreeShipping && subtotal >= freeThreshold) {
        shippingAmount = 0;
      } else {
        shippingAmount = flatRate;
      }
    }

    const totalAmount = subtotal - finalDiscount + shippingAmount;
    const orderNumber = `ELA${Date.now().toString().slice(-8)}`;

    // Create a real guest user in auth.users
    const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@elabazar.local`;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: guestEmail,
      password: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
      email_confirm: true,
      user_metadata: { full_name: guest_details.full_name || "Guest User", is_guest: true },
    });

    if (authErr || !authData?.user) {
      console.error("Failed to create guest auth user:", authErr);
      return new Response(JSON.stringify({ error: "Failed to create guest user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guestUserId = authData.user.id;

    // Ensure profile exists (trigger should create it, but upsert to be safe)
    await supabase.from("profiles").upsert({
      id: guestUserId,
      email: guestEmail,
      full_name: guest_details.full_name || "Guest User",
      phone: guest_details.phone || null,
    }, { onConflict: "id" });

    // Ensure wallet exists
    await supabase.from("wallets").upsert({
      user_id: guestUserId,
      balance: 0,
    }, { onConflict: "user_id" });

    // Insert order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: guestUserId,
        order_number: orderNumber,
        status: "pending",
        payment_status: "completed",
        subtotal,
        shipping_amount: shippingAmount,
        discount_amount: finalDiscount,
        wallet_amount_used: 0,
        total_amount: totalAmount,
        coupon_code: coupon_code || null,
        is_cod: false,
        cod_amount: 0,
        notes: `Guest Order (paid online${payment_reference ? `, ref: ${payment_reference}` : ""}) - Phone: ${guest_details.phone}, Name: ${guest_details.full_name}`,
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
