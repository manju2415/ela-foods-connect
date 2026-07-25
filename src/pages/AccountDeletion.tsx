import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2, Mail, Phone } from "lucide-react";

export default function AccountDeletion() {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone && !form.email) {
      toast.error("Please provide your phone number or email");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("account_deletion_requests").insert({
        full_name: form.full_name || null,
        phone: form.phone || null,
        email: form.email || null,
        reason: form.reason || null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success("Request submitted");
    } catch (err) {
      console.error(err);
      toast.error("Could not submit. Please email elabazar6@gmail.com directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold">Request Account Deletion</h1>
          <p className="text-muted-foreground">
            Ela Bazar — ELA FOODS AND SNACKS PRIVATE LIMITED
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What will be deleted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Submitting this form will request permanent deletion of your account and all associated personal data, including:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Profile information (name, phone, email, address)</li>
              <li>Order history and delivery details</li>
              <li>Wallet balances and transaction history</li>
              <li>Referral, network and commission records</li>
              <li>Cart, wishlist, reviews, and notifications</li>
            </ul>
            <p>Data required for legal, tax or fraud-prevention purposes (e.g. invoices) may be retained for the period mandated by applicable Indian law. Your request will be processed within 7 working days.</p>
          </CardContent>
        </Card>

        {submitted ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <h2 className="text-xl font-semibold">Request received</h2>
              <p className="text-muted-foreground">
                We have received your deletion request. Our team will process it within 7 working days and contact you on the details provided.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Submit your request</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Registered Mobile Number</Label>
                  <Input id="phone" inputMode="tel" placeholder="10-digit mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Registered Email (optional)</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea id="reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </div>
                <Button type="submit" disabled={submitting} variant="destructive" className="w-full">
                  {submitting ? "Submitting..." : "Request Account Deletion"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Prefer to contact us directly?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> <a className="text-primary underline" href="mailto:elabazar6@gmail.com?subject=Account%20Deletion%20Request">elabazar6@gmail.com</a></p>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> <a className="text-primary underline" href="tel:+919659108119">+91 96591 08119</a></p>
            <p className="text-muted-foreground pt-2">
              ELA FOODS AND SNACKS PRIVATE LIMITED, No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore, Karnataka 560090
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
