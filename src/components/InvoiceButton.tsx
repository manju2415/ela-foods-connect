import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface InvoiceButtonProps {
  orderId?: string;
  registrationPaymentId?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

type Invoice = {
  invoice_number: string;
  invoice_type: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  billing_address: Record<string, string> | null;
  payment_method: string | null;
  payment_reference: string | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_amount: number;
  discount_amount: number;
  shipping_amount: number;
  wallet_amount: number;
  total_amount: number;
  items: Array<Record<string, string | number | null>>;
  issued_at: string;
};

const money = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;

export function InvoiceButton({ orderId, registrationPaymentId, variant = "outline", size = "sm" }: InvoiceButtonProps) {
  const [loading, setLoading] = useState(false);

  const printInvoice = async () => {
    setLoading(true);
    let query = supabase.from("invoices").select("*");
    query = orderId ? query.eq("order_id", orderId) : query.eq("registration_payment_id", registrationPaymentId || "");
    const { data, error } = await query.maybeSingle();
    setLoading(false);
    if (error || !data) {
      toast.error("Invoice is not available yet");
      return;
    }
    const invoice = data as unknown as Invoice;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      toast.error("Allow pop-ups to download the invoice");
      return;
    }
    const address = invoice.billing_address || {};
    const itemRows = (invoice.items || []).map((item) => `<tr><td>${String(item.description || "Item")}</td><td>${String(item.hsn_code || item.hsn_sac || "—")}</td><td>${String(item.quantity || 1)}</td><td>${String(item.gst_rate || 0)}%</td><td>${money(item.total)}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html><head><title>${invoice.invoice_number}</title><style>body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:900px;margin:auto}header{display:flex;justify-content:space-between;border-bottom:2px solid #f97316;padding-bottom:16px}h1{margin:0;color:#f97316}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left}.totals{margin-left:auto;width:360px}.totals div{display:flex;justify-content:space-between;padding:5px}.grand{font-weight:700;border-top:2px solid #222;margin-top:6px}.muted{color:#666;font-size:13px}@media print{button{display:none}}</style></head><body><header><div><h1>ELA BAZAR</h1><div>ELA FOODS AND SNACKS PRIVATE LIMITED</div><div class="muted">No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090</div></div><div><strong>GST TAX INVOICE</strong><div>${invoice.invoice_number}</div><div>${new Date(invoice.issued_at).toLocaleDateString("en-IN")}</div></div></header><section><h3>Bill To</h3><div>${invoice.customer_name}</div><div>${invoice.customer_phone || ""} ${invoice.customer_email || ""}</div><div>${[address.address_line1,address.address_line2,address.city,address.state,address.postal_code].filter(Boolean).join(", ")}</div></section><table><thead><tr><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>GST</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><div class="totals"><div><span>Taxable value</span><span>${money(invoice.taxable_amount)}</span></div><div><span>CGST</span><span>${money(invoice.cgst_amount)}</span></div><div><span>SGST</span><span>${money(invoice.sgst_amount)}</span></div>${Number(invoice.igst_amount)>0?`<div><span>IGST</span><span>${money(invoice.igst_amount)}</span></div>`:""}${Number(invoice.discount_amount)>0?`<div><span>Discount</span><span>-${money(invoice.discount_amount)}</span></div>`:""}${Number(invoice.shipping_amount)>0?`<div><span>Shipping</span><span>${money(invoice.shipping_amount)}</span></div>`:""}${Number(invoice.wallet_amount)>0?`<div><span>Paid by wallet</span><span>${money(invoice.wallet_amount)}</span></div>`:""}<div class="grand"><span>Total</span><span>${money(invoice.total_amount)}</span></div></div><p class="muted">Payment: ${invoice.payment_method || "—"}${invoice.payment_reference ? ` · Ref: ${invoice.payment_reference}` : ""}</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);
    popup.document.close();
  };

  return <Button type="button" variant={variant} size={size} onClick={printInvoice} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Invoice</Button>;
}