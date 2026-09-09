import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";

type InvoiceItem = {
  description?: string | null;
  hsn_code?: string | null;
  hsn_sac?: string | null;
  gst_rate?: number | null;
  quantity?: number | null;
  total?: number | null;
};

type InvoiceRow = {
  invoice_number: string;
  legacy_invoice_number: string | null;
  invoice_type: string;
  issued_at: string;
  payment_status: string;
  igst_amount: number | null;
  items: InvoiceItem[] | null;
};

interface ReportLine {
  invoiceNumber: string;
  legacyNumber: string | null;
  date: string;
  description: string;
  hsn: string;
  quantity: number;
  gstRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface SummaryRow {
  hsn: string;
  gstRate: number;
  quantity: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const money = (n: number) => `₹${n.toFixed(2)}`;

const downloadCSV = (name: string, header: string[], lines: (string | number)[][]) => {
  const csv = [header.join(","), ...lines.map((l) => l.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export default function GSTReport() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["gstn-invoices", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "invoice_number, legacy_invoice_number, invoice_type, issued_at, payment_status, igst_amount, items"
        )
        // GST filing periods are IST calendar days.
        .gte("issued_at", `${from}T00:00:00+05:30`)
        .lte("issued_at", `${to}T23:59:59+05:30`)
        .eq("payment_status", "completed")
        .order("issued_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as InvoiceRow[];
    },
  });

  const lines = useMemo<ReportLine[]>(() => {
    const out: ReportLine[] = [];
    invoices.forEach((inv) => {
      const interstate = Number(inv.igst_amount || 0) > 0;
      (inv.items || []).forEach((item) => {
        const total = Number(item.total || 0);
        const rate = Number(item.gst_rate || 0);
        const taxable = rate > 0 ? (total * 100) / (100 + rate) : total;
        const gst = total - taxable;
        out.push({
          invoiceNumber: inv.invoice_number,
          legacyNumber: inv.legacy_invoice_number,
          date: inv.issued_at,
          description: item.description || "Item",
          hsn: item.hsn_code || item.hsn_sac || "UNASSIGNED",
          quantity: Number(item.quantity || 1),
          gstRate: rate,
          taxable,
          cgst: interstate ? 0 : gst / 2,
          sgst: interstate ? 0 : gst / 2,
          igst: interstate ? gst : 0,
          total,
        });
      });
    });
    return out.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [invoices]);

  const summary = useMemo<SummaryRow[]>(() => {
    const map = new Map<string, SummaryRow>();
    lines.forEach((l) => {
      const key = `${l.hsn}::${l.gstRate}`;
      const row =
        map.get(key) ||
        ({ hsn: l.hsn, gstRate: l.gstRate, quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 } as SummaryRow);
      row.quantity += l.quantity;
      row.taxable += l.taxable;
      row.cgst += l.cgst;
      row.sgst += l.sgst;
      row.igst += l.igst;
      row.total += l.total;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
  }, [lines]);

  const totals = lines.reduce(
    (acc, l) => ({
      quantity: acc.quantity + l.quantity,
      taxable: acc.taxable + l.taxable,
      cgst: acc.cgst + l.cgst,
      sgst: acc.sgst + l.sgst,
      igst: acc.igst + l.igst,
      total: acc.total + l.total,
    }),
    { quantity: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );

  const exportRegister = () =>
    downloadCSV(
      `gstn-invoice-register-${from}-to-${to}.csv`,
      ["Invoice No.", "Date", "Item Details", "HSN Code", "Qty", "Taxable Value", "GST Rate (%)", "CGST", "SGST", "IGST", "Amount", "Old Invoice No."],
      lines.map((l) => [
        l.invoiceNumber,
        fmtDate(l.date),
        `"${l.description.replace(/"/g, "'")}"`,
        l.hsn,
        l.quantity,
        l.taxable.toFixed(2),
        l.gstRate,
        l.cgst.toFixed(2),
        l.sgst.toFixed(2),
        l.igst.toFixed(2),
        l.total.toFixed(2),
        l.legacyNumber || "",
      ])
    );

  const exportSummary = () =>
    downloadCSV(
      `gstn-hsn-summary-${from}-to-${to}.csv`,
      ["HSN Code", "GST Rate (%)", "Qty", "Taxable Value", "CGST", "SGST", "IGST", "Total Value"],
      summary.map((r) => [
        r.hsn,
        r.gstRate,
        r.quantity,
        r.taxable.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
        r.igst.toFixed(2),
        r.total.toFixed(2),
      ])
    );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            GSTN Filing Report
          </h1>
          <p className="text-muted-foreground">
            Registration and sales invoices for the selected period (paid invoices only)
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Date Range</CardTitle>
            <CardDescription>Select the filing period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="register">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="register">Invoice Register</TabsTrigger>
              <TabsTrigger value="summary">HSN Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="register" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>Invoice Register</CardTitle>
                    <CardDescription>
                      Registration (R) and sales (S) invoices, in date order
                    </CardDescription>
                  </div>
                  <Button onClick={exportRegister} disabled={lines.length === 0} className="gap-2 shrink-0">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  {lines.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No paid invoices in this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice No.</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Item Details</TableHead>
                            <TableHead>HSN Code</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">GST %</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">IGST</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((l, i) => (
                            <TableRow key={`${l.invoiceNumber}-${i}`}>
                              <TableCell className="font-medium">{l.invoiceNumber}</TableCell>
                              <TableCell className="whitespace-nowrap">{fmtDate(l.date)}</TableCell>
                              <TableCell className="max-w-xs text-sm text-muted-foreground">
                                {l.description}
                              </TableCell>
                              <TableCell>{l.hsn}</TableCell>
                              <TableCell className="text-right">{l.quantity}</TableCell>
                              <TableCell className="text-right">{money(l.taxable)}</TableCell>
                              <TableCell className="text-right">{l.gstRate}%</TableCell>
                              <TableCell className="text-right">{money(l.cgst)}</TableCell>
                              <TableCell className="text-right">{money(l.sgst)}</TableCell>
                              <TableCell className="text-right">{money(l.igst)}</TableCell>
                              <TableCell className="text-right font-medium">{money(l.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-right font-bold">{totals.quantity}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.taxable)}</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-bold">{money(totals.cgst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.sgst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.igst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.total)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="summary" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>HSN Summary</CardTitle>
                    <CardDescription>Totals grouped by HSN code and GST rate</CardDescription>
                  </div>
                  <Button onClick={exportSummary} disabled={summary.length === 0} className="gap-2 shrink-0">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  {summary.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No paid invoices in this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>HSN Code</TableHead>
                            <TableHead className="text-right">GST %</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Taxable Value</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">IGST</TableHead>
                            <TableHead className="text-right">Total Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.map((r) => (
                            <TableRow key={`${r.hsn}-${r.gstRate}`}>
                              <TableCell className="font-medium">{r.hsn}</TableCell>
                              <TableCell className="text-right">{r.gstRate}%</TableCell>
                              <TableCell className="text-right">{r.quantity}</TableCell>
                              <TableCell className="text-right">{money(r.taxable)}</TableCell>
                              <TableCell className="text-right">{money(r.cgst)}</TableCell>
                              <TableCell className="text-right">{money(r.sgst)}</TableCell>
                              <TableCell className="text-right">{money(r.igst)}</TableCell>
                              <TableCell className="text-right font-medium">{money(r.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-bold">{totals.quantity}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.taxable)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.cgst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.sgst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.igst)}</TableCell>
                            <TableCell className="text-right font-bold">{money(totals.total)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
}
