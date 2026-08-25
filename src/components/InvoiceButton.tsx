import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

const COMPANY = {
  name: "ELA BAZAR",
  legal: "ELA FOODS AND SNACKS PRIVATE LIMITED",
  address:
    "No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090",
  email: "elabazar6@gmail.com",
  phone: "+919659108119",
};

const money = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;
const plain = (value: unknown) => `Rs. ${Number(value || 0).toFixed(2)}`;

const addressLine = (address: Record<string, string> | null) =>
  [
    address?.address_line1,
    address?.address_line2,
    address?.city,
    address?.state,
    address?.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

function buildPrintHtml(invoice: Invoice) {
  const itemRows = (invoice.items || [])
    .map(
      (item) =>
        `<tr><td>${String(item.description || "Item")}</td><td>${String(
          item.hsn_code || item.hsn_sac || "—"
        )}</td><td>${String(item.quantity || 1)}</td><td>${String(
          item.gst_rate || 0
        )}%</td><td>${money(item.total)}</td></tr>`
    )
    .join("");

  return `<!doctype html><html><head><title>${invoice.invoice_number}</title><style>
    body{font-family:Arial,sans-serif;color:#222;padding:32px;max-width:900px;margin:auto}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #f97316;padding-bottom:16px}
    h1{margin:0;color:#f97316}
    table{width:100%;border-collapse:collapse;margin:24px 0}
    th,td{border:1px solid #ddd;padding:10px;text-align:left}
    .totals{margin-left:auto;width:360px}
    .totals div{display:flex;justify-content:space-between;padding:5px}
    .grand{font-weight:700;border-top:2px solid #222;margin-top:6px}
    .muted{color:#666;font-size:13px}
  </style></head><body>
  <header><div><h1>${COMPANY.name}</h1><div>${COMPANY.legal}</div><div class="muted">${COMPANY.address}</div></div>
  <div><strong>GST TAX INVOICE</strong><div>${invoice.invoice_number}</div><div>${new Date(
    invoice.issued_at
  ).toLocaleDateString("en-IN")}</div></div></header>
  <section><h3>Bill To</h3><div>${invoice.customer_name}</div><div>${
    invoice.customer_phone || ""
  } ${invoice.customer_email || ""}</div><div>${addressLine(
    invoice.billing_address
  )}</div></section>
  <table><thead><tr><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>GST</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="totals"><div><span>Taxable value</span><span>${money(
    invoice.taxable_amount
  )}</span></div><div><span>CGST</span><span>${money(
    invoice.cgst_amount
  )}</span></div><div><span>SGST</span><span>${money(invoice.sgst_amount)}</span></div>${
    Number(invoice.igst_amount) > 0
      ? `<div><span>IGST</span><span>${money(invoice.igst_amount)}</span></div>`
      : ""
  }${
    Number(invoice.discount_amount) > 0
      ? `<div><span>Discount</span><span>-${money(invoice.discount_amount)}</span></div>`
      : ""
  }${
    Number(invoice.shipping_amount) > 0
      ? `<div><span>Shipping</span><span>${money(invoice.shipping_amount)}</span></div>`
      : ""
  }${
    Number(invoice.wallet_amount) > 0
      ? `<div><span>Paid by wallet</span><span>${money(invoice.wallet_amount)}</span></div>`
      : ""
  }<div class="grand"><span>Total</span><span>${money(
    invoice.total_amount
  )}</span></div></div>
  <p class="muted">Payment: ${invoice.payment_method || "—"}${
    invoice.payment_reference ? ` · Ref: ${invoice.payment_reference}` : ""
  }</p></body></html>`;
}

function printInvoiceHtml(invoice: Invoice) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    toast.error("Unable to open print view");
    return;
  }
  doc.open();
  doc.write(buildPrintHtml(invoice));
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => document.body.removeChild(iframe), 1000);
  };
  if (doc.readyState === "complete") run();
  else iframe.onload = run;
}

async function downloadInvoicePdf(invoice: Invoice) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 40;
  const right = pageWidth - 40;
  let y = 50;

  doc.setFontSize(20);
  doc.setTextColor(249, 115, 22);
  doc.text(COMPANY.name, left, y);
  doc.setTextColor(34, 34, 34);
  doc.setFontSize(11);
  doc.text("GST TAX INVOICE", right, y, { align: "right" });
  y += 16;
  doc.setFontSize(9);
  doc.text(COMPANY.legal, left, y);
  doc.text(invoice.invoice_number, right, y, { align: "right" });
  y += 12;
  doc.setTextColor(110, 110, 110);
  doc.text(doc.splitTextToSize(COMPANY.address, 320), left, y);
  doc.setTextColor(34, 34, 34);
  doc.text(new Date(invoice.issued_at).toLocaleDateString("en-IN"), right, y, {
    align: "right",
  });
  y += 34;
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(1.5);
  doc.line(left, y, right, y);
  y += 22;

  doc.setFontSize(11);
  doc.text("Bill To", left, y);
  y += 14;
  doc.setFontSize(9);
  doc.text(invoice.customer_name || "", left, y);
  y += 12;
  const contact = [invoice.customer_phone, invoice.customer_email]
    .filter(Boolean)
    .join(" · ");
  if (contact) {
    doc.text(contact, left, y);
    y += 12;
  }
  const addr = addressLine(invoice.billing_address);
  if (addr) {
    const lines = doc.splitTextToSize(addr, 320) as string[];
    doc.text(lines, left, y);
    y += lines.length * 12;
  }
  y += 14;

  const cols = [left, left + 210, left + 290, left + 340, left + 400];
  doc.setFontSize(9);
  doc.setFillColor(245, 245, 245);
  doc.rect(left, y - 11, right - left, 18, "F");
  doc.text("Description", cols[0] + 4, y);
  doc.text("HSN/SAC", cols[1], y);
  doc.text("Qty", cols[2], y);
  doc.text("GST", cols[3], y);
  doc.text("Amount", right, y, { align: "right" });
  y += 16;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  for (const item of invoice.items || []) {
    if (y > 720) {
      doc.addPage();
      y = 60;
    }
    const desc = doc.splitTextToSize(String(item.description || "Item"), 195) as string[];
    doc.text(desc, cols[0] + 4, y);
    doc.text(String(item.hsn_code || item.hsn_sac || "-"), cols[1], y);
    doc.text(String(item.quantity || 1), cols[2], y);
    doc.text(`${String(item.gst_rate || 0)}%`, cols[3], y);
    doc.text(plain(item.total), right, y, { align: "right" });
    y += Math.max(desc.length * 11, 14);
    doc.line(left, y - 4, right, y - 4);
  }

  y += 14;
  const totals: Array<[string, string]> = [
    ["Taxable value", plain(invoice.taxable_amount)],
    ["CGST", plain(invoice.cgst_amount)],
    ["SGST", plain(invoice.sgst_amount)],
  ];
  if (Number(invoice.igst_amount) > 0) totals.push(["IGST", plain(invoice.igst_amount)]);
  if (Number(invoice.discount_amount) > 0)
    totals.push(["Discount", `- ${plain(invoice.discount_amount)}`]);
  if (Number(invoice.shipping_amount) > 0)
    totals.push(["Shipping", plain(invoice.shipping_amount)]);
  if (Number(invoice.wallet_amount) > 0)
    totals.push(["Paid by wallet", plain(invoice.wallet_amount)]);

  for (const [label, value] of totals) {
    if (y > 760) {
      doc.addPage();
      y = 60;
    }
    doc.text(label, right - 200, y);
    doc.text(value, right, y, { align: "right" });
    y += 14;
  }
  doc.setLineWidth(1);
  doc.setDrawColor(34, 34, 34);
  doc.line(right - 200, y - 6, right, y - 6);
  y += 8;
  doc.setFontSize(11);
  doc.text("Total", right - 200, y);
  doc.text(plain(invoice.total_amount), right, y, { align: "right" });
  y += 24;
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Payment: ${invoice.payment_method || "-"}${
      invoice.payment_reference ? ` · Ref: ${invoice.payment_reference}` : ""
    }`,
    left,
    y
  );
  y += 11;
  doc.text(`${COMPANY.email} · ${COMPANY.phone}`, left, y);

  doc.save(`${invoice.invoice_number}.pdf`);
}

export function InvoiceButton({
  orderId,
  registrationPaymentId,
  variant = "outline",
  size = "sm",
}: InvoiceButtonProps) {
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [open, setOpen] = useState(false);

  const loadInvoice = async () => {
    setLoading(true);
    let query = supabase.from("invoices").select("*");
    query = orderId
      ? query.eq("order_id", orderId)
      : query.eq("registration_payment_id", registrationPaymentId || "");
    const { data, error } = await query.maybeSingle();
    setLoading(false);
    if (error || !data) {
      toast.error("Invoice is not available yet");
      return;
    }
    setInvoice(data as unknown as Invoice);
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={loadInvoice} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileText className="mr-2 h-4 w-4" />
        )}
        Invoice
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tax Invoice {invoice?.invoice_number}</DialogTitle>
          </DialogHeader>

          {invoice && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border p-4">
                <p className="font-semibold text-primary">{COMPANY.name}</p>
                <p>{COMPANY.legal}</p>
                <p className="text-muted-foreground text-xs">{COMPANY.address}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Issued {new Date(invoice.issued_at).toLocaleDateString("en-IN")}
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <p className="font-medium">Bill To</p>
                <p>{invoice.customer_name}</p>
                <p className="text-muted-foreground">
                  {[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(" · ")}
                </p>
                <p className="text-muted-foreground">{addressLine(invoice.billing_address)}</p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2">Description</th>
                      <th className="p-2">HSN/SAC</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2">GST</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.items || []).map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{String(item.description || "Item")}</td>
                        <td className="p-2">{String(item.hsn_code || item.hsn_sac || "—")}</td>
                        <td className="p-2">{String(item.quantity || 1)}</td>
                        <td className="p-2">{String(item.gst_rate || 0)}%</td>
                        <td className="p-2 text-right">{money(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ml-auto w-full max-w-xs space-y-1">
                <div className="flex justify-between">
                  <span>Taxable value</span>
                  <span>{money(invoice.taxable_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span>{money(invoice.cgst_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span>{money(invoice.sgst_amount)}</span>
                </div>
                {Number(invoice.igst_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>IGST</span>
                    <span>{money(invoice.igst_amount)}</span>
                  </div>
                )}
                {Number(invoice.discount_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>-{money(invoice.discount_amount)}</span>
                  </div>
                )}
                {Number(invoice.shipping_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>{money(invoice.shipping_amount)}</span>
                  </div>
                )}
                {Number(invoice.wallet_amount) > 0 && (
                  <div className="flex justify-between">
                    <span>Paid by wallet</span>
                    <span>{money(invoice.wallet_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span>{money(invoice.total_amount)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => invoice && printInvoiceHtml(invoice)}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!invoice) return;
                try {
                  await downloadInvoicePdf(invoice);
                } catch {
                  toast.error("Could not generate the PDF");
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
