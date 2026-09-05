import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GuestOrderItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
}

interface ProductVariant {
  id: string;
  product_id: string;
  label: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
}

interface OrderItemInsert {
  product_id: string;
  variant_id: string | null;
  variant_label: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  total_price: number;
}

interface ShippingSettings {
  flat_rate?: number;
  enable_free_shipping?: boolean;
  free_shipping_threshold?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { guest_details, items, coupon_code, payment_method, payment_reference } = body;

    // A successful Razorpay payment reference is the source of truth. Older
    // published clients may omit payment_method or send "razorpay", so do not
    // reject an otherwise paid order based on that display value.
    let resolvedPaymentRef =
      typeof payment_reference === "string" && payment_reference.trim() ? payment_reference.trim() : null;

    // Older/broken clients sometimes drop the payment id after a successful
    // payment. Reconcile against the payment recorded at verification time so
    // the customer never ends up paid-with-no-order.
    if (!resolvedPaymentRef && guest_details?.phone) {
      const phoneDigits = String(guest_details.phone).replace(/\D/g, "").slice(-10);
      const { data: pendingAttempt } = await supabase
        .from("payment_attempts")
        .select("id, payment_id, created_at")
        .eq("status", "pending")
        .is("order_id", null)
        .ilike("customer_phone", `%${phoneDigits}`)
        .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingAttempt?.payment_id) {
        resolvedPaymentRef = pendingAttempt.payment_id;
        console.log("Reconciled guest order with recorded payment", pendingAttempt.payment_id);
      }
    }

    if (!resolvedPaymentRef) {
      console.warn("Rejected unpaid guest order request", {
        payment_method: payment_method || null,
        has_payment_reference: false,
        phone: guest_details?.phone || null,
      });
      return new Response(JSON.stringify({ error: "Verified online payment is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A payment reference is only trustworthy if it matches a payment that
    // razorpay-verify-payment actually confirmed with Razorpay — a client
    // could otherwise send any non-empty string as "proof" of payment.
    const { data: verifiedPayment } = await supabase
      .from("payment_attempts")
      .select("id, amount, status, order_id")
      .eq("payment_id", resolvedPaymentRef)
      .maybeSingle();

    if (!verifiedPayment || verifiedPayment.status !== "pending" || verifiedPayment.order_id) {
      console.warn("Rejected guest order with unverified or already-used payment reference", { resolvedPaymentRef });
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
    const productIds = (items as GuestOrderItem[]).map((i) => i.product_id);
    const variantIds = (items as GuestOrderItem[]).map((i) => i.variant_id).filter(Boolean);
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

    const productMap = new Map((products as Product[]).map((p) => [p.id, p]));
    const { data: variants, error: variantErr } = variantIds.length
      ? await supabase
          .from("product_variants")
          .select("id, product_id, label, price, stock_quantity, is_active")
          .in("id", variantIds)
      : { data: [], error: null };

    if (variantErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch product variants" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const variantMap = new Map((variants as ProductVariant[] || []).map((variant) => [variant.id, variant]));
    let subtotal = 0;
    const orderItems: OrderItemInsert[] = [];

    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) continue;
      const variant = item.variant_id ? variantMap.get(item.variant_id) : null;
      if (item.variant_id && (!variant || variant.product_id !== product.id || !variant.is_active)) {
        return new Response(JSON.stringify({ error: "Selected product variant is unavailable" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (variant && (item.quantity < 1 || item.quantity > variant.stock_quantity)) {
        return new Response(JSON.stringify({ error: `${variant.label} is out of stock or has insufficient stock` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const unitPrice = variant?.price ?? product.price;
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;
      orderItems.push({
        product_id: item.product_id,
        variant_id: variant?.id ?? null,
        variant_label: variant?.label ?? null,
        product_name: variant ? `${product.name} (${variant.label})` : product.name,
        product_price: unitPrice,
        quantity: item.quantity,
        total_price: itemTotal,
      });
    }

    // Recompute the discount from the coupon's real rules server-side —
    // never trust the client's `discount_amount`. A guest is never a member
    // and first-order eligibility can't be verified without an account, so
    // member-only/first-order-only coupons are rejected outright for guests.
    let finalDiscount = 0;
    if (coupon_code) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", String(coupon_code).toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      const now = new Date();
      const eligible =
        coupon &&
        coupon.audience !== "members" &&
        !coupon.first_order_only &&
        (!coupon.min_order_amount || subtotal >= coupon.min_order_amount) &&
        (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit) &&
        (!coupon.valid_until || new Date(coupon.valid_until) >= now);

      if (eligible) {
        const raw =
          coupon.discount_type === "percentage"
            ? (subtotal * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
        finalDiscount = Math.min(
          raw,
          subtotal,
          coupon.max_discount_amount ? Number(coupon.max_discount_amount) : raw
        );
      }
    }

    // Fetch shipping settings
    let shippingAmount = 0;
    const { data: shippingSettingsRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "shipping_settings")
      .maybeSingle();

    if (shippingSettingsRow?.value) {
      const ss = shippingSettingsRow.value as ShippingSettings;
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

    // The verified payment must actually cover what this order costs — recomputed
    // from DB prices above, never trusted from the client.
    if (Number(verifiedPayment.amount || 0) < totalAmount) {
      console.warn("Rejected guest order: verified payment does not cover order total", {
        resolvedPaymentRef,
        paidAmount: verifiedPayment.amount,
        totalAmount,
      });
      return new Response(JSON.stringify({ error: "Paid amount does not match order total" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        notes: `Guest Order (paid online, ref: ${resolvedPaymentRef}) - Phone: ${guest_details.phone}, Name: ${guest_details.full_name}`,
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
    const itemsWithOrderId = orderItems.map((i) => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsWithOrderId);
    if (itemsErr) {
      console.error("Order items insert error:", itemsErr);
      return new Response(JSON.stringify({ error: "Failed to create order items" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The order is already payment-verified. Commit its inventory only after
    // all order items exist; the RPC is idempotent across function retries.
    const { error: stockErr } = await supabase.rpc("deduct_paid_order_stock", {
      p_order_id: order.id,
    });
    if (stockErr) {
      console.error("Paid order stock deduction error:", stockErr);
      return new Response(JSON.stringify({ error: "Payment received, but stock could not be committed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Close out the recorded payment so it no longer shows as "paid, no order"
    await supabase
      .from("payment_attempts")
      .update({ status: "converted", order_id: order.id, user_id: guestUserId })
      .eq("payment_id", resolvedPaymentRef);

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
