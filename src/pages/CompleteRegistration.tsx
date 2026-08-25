import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { IfscInput } from "@/components/IfscInput";
import { UserAgreementDialog } from "@/components/UserAgreementDialog";
import { Loader2, MapPin, Building2, User, Phone, CheckCircle2 } from "lucide-react";


const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const INDIAN_CITIES: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Tirupati", "Rajahmundry", "Kakinada", "Anantapur", "Eluru"],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro"],
  "Assam": ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur"],
  "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", "Arrah", "Begusarai"],
  "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon"],
  "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Gandhinagar", "Anand"],
  "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar", "Rohtak", "Sonipat"],
  "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi", "Kullu"],
  "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh", "Deoghar"],
  "Karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangaluru", "Belagavi", "Davangere", "Shimoga", "Tumkur"],
  "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Palakkad", "Alappuzha"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Rewa", "Satna"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad", "Solapur", "Kolhapur", "Navi Mumbai"],
  "Manipur": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur"],
  "Meghalaya": ["Shillong", "Tura", "Jowai", "Nongstoin"],
  "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Serchhip"],
  "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Tuensang"],
  "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bhilwara"],
  "Sikkim": ["Gangtok", "Namchi", "Gyalshing", "Mangan"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Mahbubnagar"],
  "Tripura": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Agra", "Varanasi", "Meerut", "Allahabad", "Ghaziabad", "Noida", "Bareilly"],
  "Uttarakhand": ["Dehradun", "Haridwar", "Rishikesh", "Roorkee", "Haldwani", "Nainital"],
  "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol", "Bardhaman", "Kharagpur"],
  "Andaman and Nicobar Islands": ["Port Blair"],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa", "Daman", "Diu"],
  "Delhi": ["New Delhi", "Delhi"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla"],
  "Ladakh": ["Leh", "Kargil"],
  "Lakshadweep": ["Kavaratti"],
  "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
};

const registrationSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z.string().trim().min(10, "Enter a valid 10-digit phone number").max(15),
  address_line1: z.string().trim().min(5, "Address is required"),
  address_line2: z.string().optional(),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().min(2, "State is required"),
  postal_code: z.string().trim().min(6, "Enter a valid 6-digit PIN code").max(6),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

const CompleteRegistration = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [agreed, setAgreed] = useState(false);


  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
    },
  });

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      navigate("/auth");
      return;
    }

    checkProfileStatus();
  }, [user, authLoading, navigate]);

  const checkProfileStatus = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, bank_account_number, accepted_agreement_at, registration_fee_paid")
      .eq("id", user.id)
      .single();

    if (profile) {
      // Check if profile is already complete
      const hasPhone = !!profile.phone;
      const hasRegistered = !!profile.accepted_agreement_at || !!profile.bank_account_number;
      const hasPaid = (profile.registration_fee_paid || 0) > 0;

      if (hasPhone && hasRegistered) {
        setProfileComplete(true);
        // If profile is complete but payment pending, go to payment
        if (!hasPaid) {
          navigate("/registration-payment", { replace: true });
        } else {
          // Everything is complete, go to dashboard
          navigate("/dashboard", { replace: true });
        }
        return;
      }

      // Pre-fill form with existing data
      form.setValue("full_name", profile.full_name || "");
    }

    // Always use the logged-in user's own phone number (profile / auth account),
    // never a phone saved on an address record.
    const ownPhone =
      profile?.phone ||
      (user.email?.endsWith("@elabazar.local") ? user.email.split("@")[0] : "") ||
      "";
    const ownPhoneDigits = ownPhone.replace(/\D/g, "").slice(-10);
    if (ownPhoneDigits) form.setValue("phone", ownPhoneDigits);

    // Check for existing address
    const { data: addresses } = await supabase
      .from("addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (addresses) {
      form.setValue("address_line1", addresses.address_line1 || "");
      form.setValue("address_line2", addresses.address_line2 || "");
      form.setValue("city", addresses.city || "");
      form.setValue("state", addresses.state || "");
      form.setValue("postal_code", addresses.postal_code || "");
      form.setValue("full_name", addresses.full_name || form.getValues("full_name"));
    }

    setIsLoading(false);
  };



  const handleSubmit = async (data: RegistrationFormData) => {
    if (!user) return;

    setIsSubmitting(true);

    try {
      // Update profile with phone and bank details
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: data.full_name,
          phone: data.phone,
          accepted_agreement_at: new Date().toISOString(),

        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Check if default address exists
      const { data: existingAddress } = await supabase
        .from("addresses")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (existingAddress) {
        // Update existing address
        const { error: addressError } = await supabase
          .from("addresses")
          .update({
            full_name: data.full_name,
            phone: data.phone,
            address_line1: data.address_line1,
            address_line2: data.address_line2 || null,
            city: data.city,
            state: data.state,
            postal_code: data.postal_code,
          })
          .eq("id", existingAddress.id);

        if (addressError) throw addressError;
      } else {
        // Create new default address
        const { error: addressError } = await supabase.from("addresses").insert({
          user_id: user.id,
          full_name: data.full_name,
          phone: data.phone,
          address_line1: data.address_line1,
          address_line2: data.address_line2 || null,
          city: data.city,
          state: data.state,
          postal_code: data.postal_code,
          country: "India",
          is_default: true,
          label: "Home",
        });

        if (addressError) throw addressError;
      }

      toast({
        title: "Registration details saved!",
        description: "Now complete your payment to activate your membership.",
      });

      // Navigate to payment page
      navigate("/registration-payment");
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Error",
        description: "Failed to save details. Please try again.",
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (profileComplete) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Profile Complete!</h2>
              <p className="text-muted-foreground mb-6">Redirecting...</p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Complete Your Registration</h1>
            <p className="text-muted-foreground">
              Please provide your details to activate your Ela Bazar membership
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                1
              </div>
              <span className="ml-2 text-sm font-medium">Details</span>
            </div>
            <div className="w-12 h-0.5 bg-muted mx-2" />
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
                2
              </div>
              <span className="ml-2 text-sm text-muted-foreground">Payment</span>
            </div>
            <div className="w-12 h-0.5 bg-muted mx-2" />
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
                3
              </div>
              <span className="ml-2 text-sm text-muted-foreground">Dashboard</span>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Personal Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      placeholder="Your full name"
                      {...form.register("full_name")}
                    />
                    {form.formState.errors.full_name && (
                      <p className="text-sm text-destructive">{form.formState.errors.full_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                        +91
                      </span>
                      <Input
                        id="phone"
                        readOnly
                        placeholder="Enter 10-digit mobile number"
                        className="rounded-l-none bg-muted"
                        autoComplete="off"
                        {...form.register("phone")}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Your registered login number</p>
                    {form.formState.errors.phone && (
                      <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Address Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Delivery Address
                </CardTitle>
                <CardDescription>This will be your default delivery address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address_line1">Address Line 1 *</Label>
                  <Input
                    id="address_line1"
                    placeholder="House/Flat No., Building Name, Street"
                    {...form.register("address_line1")}
                  />
                  {form.formState.errors.address_line1 && (
                    <p className="text-sm text-destructive">{form.formState.errors.address_line1.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_line2">Address Line 2 (Optional)</Label>
                  <Input
                    id="address_line2"
                    placeholder="Landmark, Area"
                    {...form.register("address_line2")}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Select
                      value={form.watch("state")}
                      onValueChange={(value) => {
                        form.setValue("state", value, { shouldValidate: true });
                        form.setValue("city", "", { shouldValidate: false });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDIAN_STATES.map((state) => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.state && (
                      <p className="text-sm text-destructive">{form.formState.errors.state.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Select
                      value={form.watch("city")}
                      onValueChange={(value) => form.setValue("city", value, { shouldValidate: true })}
                      disabled={!form.watch("state")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={form.watch("state") ? "Select City" : "Select state first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(INDIAN_CITIES[form.watch("state")] || []).map((city) => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.city && (
                      <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">PIN Code *</Label>
                    <Input
                      id="postal_code"
                      placeholder="6-digit PIN"
                      maxLength={6}
                      {...form.register("postal_code")}
                    />
                    {form.formState.errors.postal_code && (
                      <p className="text-sm text-destructive">{form.formState.errors.postal_code.message}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bank Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Bank Account Details
                </CardTitle>
                <CardDescription>Required for withdrawal of earnings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name *</Label>
                    <Input
                      id="bank_name"
                      placeholder="e.g., State Bank of India"
                      {...form.register("bank_name")}
                    />
                    {form.formState.errors.bank_name && (
                      <p className="text-sm text-destructive">{form.formState.errors.bank_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_ifsc">IFSC Code *</Label>
                    <IfscInput
                      id="bank_ifsc"
                      value={form.watch("bank_ifsc")}
                      onChange={(v) => form.setValue("bank_ifsc", v, { shouldValidate: true })}
                      onVerified={(details) => {
                        if (details?.bank) form.setValue("bank_name", details.bank, { shouldValidate: true });
                      }}
                    />
                    {form.formState.errors.bank_ifsc && (
                      <p className="text-sm text-destructive">{form.formState.errors.bank_ifsc.message}</p>
                    )}
                  </div>

                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bank_account_number">Account Number *</Label>
                    <Input
                      id="bank_account_number"
                      placeholder="Account number"
                      {...form.register("bank_account_number")}
                    />
                    {form.formState.errors.bank_account_number && (
                      <p className="text-sm text-destructive">{form.formState.errors.bank_account_number.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank_account_holder">Account Holder Name *</Label>
                    <Input
                      id="bank_account_holder"
                      placeholder="Name as per bank records"
                      {...form.register("bank_account_holder")}
                    />
                    {form.formState.errors.bank_account_holder && (
                      <p className="text-sm text-destructive">{form.formState.errors.bank_account_holder.message}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-3 rounded-md border p-4">
              <Checkbox
                id="agreement"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="agreement" className="text-sm font-normal leading-relaxed">
                I confirm I am 18 years or older and I have read and agree to the{" "}
                <UserAgreementDialog />, including that the registration fee is non-refundable.
              </Label>
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting || !agreed}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Continue to Payment"
              )}
            </Button>

          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CompleteRegistration;
