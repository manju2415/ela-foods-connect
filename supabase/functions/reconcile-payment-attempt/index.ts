import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Caller must be a signed-in admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await admin.rpc("is_any_admin", { _user_id: caller.id });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { attempt_id, action } = await req.json();
    if (!attempt_id) return json({ error: "attempt_id is required" }, 400);

    const { data: attempt, error: attemptErr } = await admin
      .from("payment_attempts")
      .select("*")
      .eq("id", attempt_id)
      .maybeSingle();

    if (attemptErr || !attempt) return json({ error: "Payment record not found" }, 404);
    if (attempt.order_id) return json({ error: "This payment already has an order" }, 400);

    if (action === "dismiss") {
      await admin.from("payment_attempts").update({ status: "dismissed" }).eq("id", attempt_id);
      return json({ success: true, dismissed: true });
    }

    const items = Array.isArray(attempt.items) ? attempt.items : [];
    if (items.length === 0) {
      return json({ error: "No cart items recorded for this payment — create the order manually" }, 400);
    }

    // Price the order from the database, never from the client snapshot
    const productIds = items.map((i: any) => i.product_id);
    const { data: products } = await admin
      .from("products")
      .select("id, name, price, stock_quantity")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p: any) => [p.id, p]));
    let subtotal = 0;
    const orderItems: any[] = [];
    for (const item of items) {
      const product: any = productMap.get(item.product_id);
      if (!product) continue;
      const totalPrice = Number(product.price) * Number(item.quantity);
      subtotal += totalPrice;
      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        quantity: item.quantity,
        total_price: totalPrice,
      });
    }

    if (orderItems.length === 0) return json({ error: "Recorded products no longer exist" }, 400);

    const discount = Math.min(Number(attempt.discount_amount || 0), subtotal);
    const paidAmount = Number(attempt.amount || 0);
    const shipping = Math.max(0, Number((paidAmount - (subtotal - discount)).toFixed(2)));
    const totalAmount = paidAmount > 0 ? paidAmount : subtotal - discount;

    const guest = (attempt.guest_details || {}) as any;
    let userId = attempt.user_id as string | null;

    if (!userId) {
      const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@elabazar.local`;
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: guestEmail,
        password: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
        email_confirm: true,
        user_metadata: { full_name: attempt.customer_name || "Guest User", is_guest: true },
      });
      if (authErr || !authData?.user) return json({ error: "Failed to create customer account" }, 500);
      userId = authData.user.id;
      await admin.from("profiles").upsert(
        {
          id: userId,
          email: guestEmail,
          full_name: attempt.customer_name || "Guest User",
          phone: attempt.customer_phone || null,
        },
        { onConflict: "id" }
      );
    }

    let shippingAddress: any = {
      full_name: attempt.customer_name || guest.full_name || "Customer",
      phone: attempt.customer_phone || guest.phone || "",
      email: attempt.customer_email || guest.email || "",
      address_line1: guest.address_line1 || "",
      address_line2: guest.address_line2 || "",
      city: guest.city || "",
      state: guest.state || "",
      postal_code: guest.postal_code || "",
      country: "India",
    };

    if (!shippingAddress.address_line1 && attempt.user_id) {
      const { data: addr } = await admin
        .from("addresses")
        .select("*")
        .eq("user_id", attempt.user_id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (addr) {
        shippingAddress = {
          full_name: addr.full_name,
          phone: addr.phone,
          email: attempt.customer_email || "",
          address_line1: addr.address_line1,
          address_line2: addr.address_line2 || "",
          city: addr.city,
          state: addr.state,
          postal_code: addr.postal_code,
          country: addr.country || "India",
        };
      }
    }

    const orderNumber = `ELA${Date.now().toString().slice(-8)}`;
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        order_number: orderNumber,
        status: "confirmed",
        payment_status: "completed",
        subtotal,
        discount_amount: discount,
        shipping_amount: shipping,
        wallet_amount_used: 0,
        total_amount: totalAmount,
        coupon_code: attempt.coupon_code || null,
        is_cod: false,
        cod_amount: 0,
        fulfillment_type: "delivery",
        notes: `Recovered from payment ${attempt.payment_id}`,
        shipping_address: shippingAddress,
      })
      .select()
      .single();

    if (orderErr || !order) {
      console.error("Recovery order insert failed:", orderErr);
      return json({ error: "Failed to create order" }, 500);
    }

    const { error: itemsErr } = await admin
      .from("order_items")
      .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));
    if (itemsErr) {
      console.error("Recovery order items failed:", itemsErr);
      return json({ error: "Failed to create recovered order items" }, 500);
    }

    // Commit inventory through the same idempotent paid-order path used by
    // normal and guest checkout (including variant inventory).
    const { error: stockErr } = await admin.rpc("deduct_paid_order_stock", {
      p_order_id: order.id,
    });
    if (stockErr) {
      console.error("Recovery stock deduction failed:", stockErr);
      return json({ error: "Payment recovered, but stock could not be committed" }, 409);
    }

    await admin
      .from("payment_attempts")
      .update({ status: "converted", order_id: order.id, user_id: userId })
      .eq("id", attempt_id);

    return json({ success: true, order_id: order.id, order_number: orderNumber });
  } catch (err) {
    console.error("Reconcile error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
