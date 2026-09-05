import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";

interface ReportRow {
  hsn: string;
  products: Set<string>;
  quantity: number;
  taxableValue: number;
  gstRate: number;
  taxAmount: number;
  totalValue: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function GSTReport() {
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["gst-report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "quantity, total_price, product_name, variant_label, products(hsn_code, gst_percentage, gst_inclusive), orders!inner(created_at, payment_status)"
        )
        // GST filing periods are IST calendar days — an unqualified
        // timestamp would be interpreted in the DB's timezone (UTC),
        // shifting orders near midnight IST into the wrong filing day.
        .gte("orders.created_at", `${from}T00:00:00+05:30`)
        .lte("orders.created_at", `${to}T23:59:59+05:30`)
        .eq("orders.payment_status", "completed")
        .neq("orders.status", "cancelled");
      if (error) throw error;
      return (data || []) as unknown as {
        quantity: number;
        total_price: number;
        product_name: string;
        variant_label: string | null;
        products: { hsn_code: string | null; gst_percentage: number | null; gst_inclusive: boolean | null } | null;
      }[];
    },
  });

  const report = useMemo(() => {
    const map = new Map<string, ReportRow>();
    rows.forEach((item) => {
      const hsn = item.products?.hsn_code || "UNASSIGNED";
      const rate = Number(item.products?.gst_percentage || 0);
      const inclusive = item.products?.gst_inclusive ?? true;
      const total = Number(item.total_price || 0);
      const taxable = rate > 0 && inclusive ? (total * 100) / (100 + rate) : total;
      const tax = rate > 0 ? (inclusive ? total - taxable : (total * rate) / 100) : 0;
      const key = `${hsn}::${rate}`;
      const existing =
        map.get(key) ||
        ({ hsn, products: new Set<string>(), quantity: 0, taxableValue: 0, gstRate: rate, taxAmount: 0, totalValue: 0 } as ReportRow);
      existing.products.add(
        item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name
      );
      existing.quantity += Number(item.quantity || 0);
      existing.taxableValue += taxable;
      existing.taxAmount += tax;
      existing.totalValue += inclusive ? total : total + tax;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.hsn.localeCompare(b.hsn));
  }, [rows]);

  const totals = report.reduce(
    (acc, r) => ({
      quantity: acc.quantity + r.quantity,
      taxableValue: acc.taxableValue + r.taxableValue,
      taxAmount: acc.taxAmount + r.taxAmount,
      totalValue: acc.totalValue + r.totalValue,
    }),
    { quantity: 0, taxableValue: 0, taxAmount: 0, totalValue: 0 }
  );

  const exportCSV = () => {
    const header = [
      "HSN Code",
      "Products",
      "Quantity",
      "Taxable Value",
      "GST Rate (%)",
      "CGST",
      "SGST",
      "Total Tax",
      "Total Value",
    ];
    const lines = report.map((r) =>
      [
        r.hsn,
        `"${Array.from(r.products).join("; ").replace(/"/g, "'")}"`,
        r.quantity,
        r.taxableValue.toFixed(2),
        r.gstRate,
        (r.taxAmount / 2).toFixed(2),
        (r.taxAmount / 2).toFixed(2),
        r.taxAmount.toFixed(2),
        r.totalValue.toFixed(2),
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gstn-filing-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-7 w-7 text-primary" />
              GSTN Filing Report
            </h1>
            <p className="text-muted-foreground">Sales grouped by HSN code for the selected period (paid orders only)</p>
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
                <Button onClick={exportCSV} disabled={report.length === 0} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export CSV / Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HSN Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : report.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No paid sales in this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>HSN Code</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Taxable Value</TableHead>
                        <TableHead className="text-right">GST %</TableHead>
                        <TableHead className="text-right">CGST</TableHead>
                        <TableHead className="text-right">SGST</TableHead>
                        <TableHead className="text-right">Total Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.map((r) => (
                        <TableRow key={`${r.hsn}-${r.gstRate}`}>
                          <TableCell className="font-medium">{r.hsn}</TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">
                            {Array.from(r.products).join(", ")}
                          </TableCell>
                          <TableCell className="text-right">{r.quantity}</TableCell>
                          <TableCell className="text-right">₹{r.taxableValue.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{r.gstRate}%</TableCell>
                          <TableCell className="text-right">₹{(r.taxAmount / 2).toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{(r.taxAmount / 2).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">₹{r.totalValue.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-bold">Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold">{totals.quantity}</TableCell>
                        <TableCell className="text-right font-bold">₹{totals.taxableValue.toFixed(2)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-bold">₹{(totals.taxAmount / 2).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold">₹{(totals.taxAmount / 2).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold">₹{totals.totalValue.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </AdminLayout>
  );
}
