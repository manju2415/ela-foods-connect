import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OrderEmailRequest {
  order_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id }: OrderEmailRequest = await req.json();

    if (!order_id) {
      throw new Error("Order ID is required");
    }

    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", order.user_id)
      .single();

    if (!profile?.email) {
      throw new Error("User email not found");
    }

    // Fetch order items
    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    const shippingAddress = order.shipping_address as {
      full_name?: string;
      address_line1?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      phone?: string;
    };

    // Generate order items HTML
    const itemsHtml = (items || [])
      .map(
        (item: { product_name: string; quantity: number; product_price: number; total_price: number }) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${item.product_name}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₹${Number(item.product_price).toFixed(2)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₹${Number(item.total_price).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #D97706 0%, #B45309 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Order Confirmed! 🎉</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333;">Dear ${profile.full_name || "Customer"},</p>
          <p style="font-size: 16px; color: #333;">Thank you for your order! We're excited to prepare your delicious snacks.</p>
          
          <!-- Order Info -->
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; color: #D97706; font-size: 18px;">Order Details</h2>
            <p style="margin: 5px 0; color: #666;"><strong>Order Number:</strong> ${order.order_number}</p>
            <p style="margin: 5px 0; color: #666;"><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p style="margin: 5px 0; color: #666;"><strong>Payment Method:</strong> Cash on Delivery</p>
          </div>
          
          <!-- Items Table -->
          <h3 style="color: #333; margin-top: 30px;">Items Ordered</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f8f8f8;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #D97706;">Product</th>
                <th style="padding: 12px; text-align: center; border-bottom: 2px solid #D97706;">Qty</th>
                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #D97706;">Price</th>
                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #D97706;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <!-- Order Summary -->
          <div style="margin-top: 20px; text-align: right;">
            <p style="margin: 5px 0; color: #666;">Subtotal: ₹${Number(order.subtotal).toFixed(2)}</p>
            ${Number(order.discount_amount) > 0 ? `<p style="margin: 5px 0; color: #22c55e;">Discount: -₹${Number(order.discount_amount).toFixed(2)}</p>` : ""}
            ${Number(order.wallet_amount_used) > 0 ? `<p style="margin: 5px 0; color: #22c55e;">Wallet: -₹${Number(order.wallet_amount_used).toFixed(2)}</p>` : ""}
            <p style="margin: 5px 0; color: #666;">Shipping: Free</p>
            <p style="margin: 10px 0; font-size: 20px; color: #D97706;"><strong>Total: ₹${Number(order.total_amount).toFixed(2)}</strong></p>
          </div>
          
          <!-- Shipping Address -->
          <div style="background-color: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Shipping Address</h3>
            <p style="margin: 0; color: #666;">
              ${shippingAddress?.full_name || ""}<br>
              ${shippingAddress?.address_line1 || ""}<br>
              ${shippingAddress?.city || ""}, ${shippingAddress?.state || ""} - ${shippingAddress?.postal_code || ""}<br>
              Phone: ${shippingAddress?.phone || ""}
            </p>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            We'll notify you when your order is shipped. If you have any questions, feel free to reply to this email.
          </p>
          
          <p style="font-size: 16px; color: #333; margin-top: 20px;">
            Thank you for choosing ELA Foods!<br>
            <strong>The ELA Foods Team</strong>
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f8f8; padding: 20px; text-align: center;">
          <p style="margin: 0; color: #999; font-size: 12px;">© ${new Date().getFullYear()} ELA Foods. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "ELA Foods <orders@resend.dev>",
      to: [profile.email],
      subject: `Order Confirmed - ${order.order_number}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("Error in send-order-confirmation function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
