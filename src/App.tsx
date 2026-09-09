import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Suspense, useEffect } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { PWABadge } from "@/components/pwa/PWABadge";
import { canRegisterSW, unregisterStaleAppSW } from "@/pwa/sw-guard";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { AppErrorBoundary } from "@/components/errors/AppErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import OnboardingGate from "@/components/OnboardingGate";

import RoleBasedRedirect from "@/components/RoleBasedRedirect";
import { ScrollToTop } from "@/components/ScrollToTop";
import { LayoutOverrideProvider } from "./contexts/AdminLayoutContext";
import { MLMAdminLayout } from "./components/mlm-admin/MLMAdminLayout";
import { SuperAdminGuard } from "./components/admin/SuperAdminGuard";

// Critical path - eagerly loaded
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Products from "./pages/Products";

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Signup = lazy(() => import("./pages/Signup"));
const UserAgreementPage = lazy(() => import("./pages/UserAgreement"));

const ShopByCategory = lazy(() => import("./pages/ShopByCategory"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Checkout = lazy(() => import("./pages/Checkout"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const GuestCheckout = lazy(() => import("./pages/GuestCheckout"));
const PaymentBridge = lazy(() => import("./pages/PaymentBridge"));
const RegistrationPayment = lazy(() => import("./pages/RegistrationPayment"));
const CompleteRegistration = lazy(() => import("./pages/CompleteRegistration"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MLMLogin = lazy(() => import("./pages/MLMLogin"));
const Policies = lazy(() => import("./pages/Policies"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const StoreLocator = lazy(() => import("./pages/StoreLocator"));
const MobileApps = lazy(() => import("./pages/MobileApps"));
const AccountDeletion = lazy(() => import("./pages/AccountDeletion"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const FoundingMembers = lazy(() => import("./pages/admin/FoundingMembers"));
const ReferralCodes = lazy(() => import("./pages/admin/ReferralCodes"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const ProductDisplaySettings = lazy(() => import("./pages/admin/ProductDisplaySettings"));
const AdminCategories = lazy(() => import("./pages/admin/Categories"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminDeliveryPartners = lazy(() => import("./pages/admin/DeliveryPartners"));
const AdminOrderAssignments = lazy(() => import("./pages/admin/OrderAssignments"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminInventory = lazy(() => import("./pages/admin/Inventory"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const MLMSettings = lazy(() => import("./pages/admin/MLMSettings"));
const AdminWithdrawals = lazy(() => import("./pages/admin/Withdrawals"));
const NetworkAnalytics = lazy(() => import("./pages/admin/NetworkAnalytics"));
const AdminTestimonials = lazy(() => import("./pages/admin/Testimonials"));
const AdminBanners = lazy(() => import("./pages/admin/Banners"));
const AdminFounders = lazy(() => import("./pages/admin/Founders"));
const AdminFounderPayments = lazy(() => import("./pages/admin/FounderPayments"));
const AdminGSTReport = lazy(() => import("./pages/admin/GSTReport"));
const AdminPaymentRecovery = lazy(() => import("./pages/admin/PaymentRecovery"));

const AdminReturnRequests = lazy(() => import("./pages/admin/ReturnRequests"));
const AdminPolicies = lazy(() => import("./pages/admin/Policies"));
const AdminStores = lazy(() => import("./pages/admin/Stores"));
const AdminStoreInventory = lazy(() => import("./pages/admin/StoreInventory"));
const AdminAdvertisements = lazy(() => import("./pages/admin/Advertisements"));
const NetworkAdmin = lazy(() => import("./pages/admin/NetworkAdmin"));

// MLM Admin
const MLMDashboard = lazy(() => import("./pages/mlm-admin/MLMDashboard"));

// Mobile App pages
const DriverApp = lazy(() => import("./pages/DriverApp"));
const CustomerApp = lazy(() => import("./pages/CustomerApp"));
const MemberApp = lazy(() => import("./pages/MemberApp"));
const CustomerOrdersPage = lazy(() => import("./pages/mobile/customer/OrdersPage"));
const CustomerOrderDetailPage = lazy(() => import("./pages/mobile/customer/OrderDetailPage"));
const CustomerWalletPage = lazy(() => import("./pages/mobile/customer/WalletPage"));
const CustomerProfilePage = lazy(() => import("./pages/mobile/customer/ProfilePage"));
const CustomerAddressesPage = lazy(() => import("./pages/mobile/customer/AddressesPage"));
const DriverOrdersPage = lazy(() => import("./pages/mobile/driver/OrdersPage"));
const DriverEarningsPage = lazy(() => import("./pages/mobile/driver/EarningsPage"));
const DriverProfilePage = lazy(() => import("./pages/mobile/driver/ProfilePage"));
const MemberNetworkPage = lazy(() => import("./pages/mobile/member/NetworkPage"));
const MemberShopPage = lazy(() => import("./pages/mobile/member/ShopPage"));

// PWA Install Pages
const CustomerInstall = lazy(() => import("./pages/install/CustomerInstall"));
const DriverInstall = lazy(() => import("./pages/install/DriverInstall"));
const MemberInstall = lazy(() => import("./pages/install/MemberInstall"));

const queryClient = new QueryClient();

// Minimal loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

function App() {
  useEffect(() => {
    // In contexts where the app-shell SW must not run (dev / Lovable preview /
    // iframe / native app), evict any stale registration left over from a
    // previous build — native apps previously registered this SW too, which
    // kept serving old cached JS after an App Store/Play Store update.
    if (!canRegisterSW()) {
      unregisterStaleAppSW();
    }
  }, []);

  useEffect(() => {
    // Native app only: if this is the first launch since the APK was updated,
    // refresh the auth session and drop all cached query data so an
    // already-logged-in user sees new features/data immediately — the same
    // effect a manual log-out/log-in has today, but automatic.
    if (!Capacitor.isNativePlatform()) return;
    const STORAGE_KEY = "ela_last_seen_app_build";

    (async () => {
      try {
        const info = await CapacitorApp.getInfo();
        const currentBuild = `${info.version}:${info.build}`;
        const lastSeen = localStorage.getItem(STORAGE_KEY);

        if (lastSeen && lastSeen !== currentBuild) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.auth.refreshSession().catch(() => {});
          }
          queryClient.clear();
        }
        localStorage.setItem(STORAGE_KEY, currentBuild);
      } catch {
        // getInfo() unavailable — nothing to do
      }
    })();
  }, []);

  useEffect(() => {
    let lastToastAt = 0;

    const notify = (message: string) => {
      const now = Date.now();
      if (now - lastToastAt < 3000) return;
      lastToastAt = now;
      toast.error(message);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[global] Unhandled promise rejection:", event.reason);
      notify("An unexpected error occurred. Please reload.");
      event.preventDefault();
    };

    const onError = (event: ErrorEvent) => {
      console.error("[global] Uncaught error:", event.error ?? event.message);
      notify("An unexpected error occurred. Please reload.");
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <AuthProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            {/* Single guarded PWA registration + update prompt (no-op in dev/preview) */}
            {canRegisterSW() && <PWABadge />}
              <BrowserRouter>
                <CartProvider>
                  <WishlistProvider>
                    <ScrollToTop />
                    <OnboardingGate />
                    <Suspense fallback={<PageLoader />}>
                      <Routes>

                        <Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/auth" replace /> : <Index />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/founder-signup" element={<Signup />} />
                        <Route path="/shop" element={<Index />} />
                        <Route path="/role-redirect" element={<AuthGuard><RoleBasedRedirect /></AuthGuard>} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/categories" element={<ShopByCategory />} />
                        <Route path="/category/:slug" element={<CategoryPage />} />
                        <Route path="/category/:slug/:subSlug" element={<CategoryPage />} />
                        <Route path="/product/:slug" element={<ProductDetail />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/guest-checkout" element={<GuestCheckout />} />
                        <Route path="/payment-bridge" element={<PaymentBridge />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/delivery" element={<DeliveryDashboard />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/admin/network-admin" element={<NetworkAdmin />} />
                        <Route path="/admin/founding-members" element={<SuperAdminGuard><FoundingMembers /></SuperAdminGuard>} />
                        <Route path="/admin/referral-codes" element={<SuperAdminGuard><ReferralCodes /></SuperAdminGuard>} />
                        <Route path="/admin/orders" element={<AdminOrders />} />
                        <Route path="/admin/products" element={<AdminProducts />} />
                        <Route path="/admin/product-display" element={<SuperAdminGuard><ProductDisplaySettings /></SuperAdminGuard>} />
                        <Route path="/admin/categories" element={<AdminCategories />} />
                        <Route path="/admin/coupons" element={<AdminCoupons />} />
                        <Route path="/admin/settings" element={<AdminSettings />} />
                        <Route path="/admin/delivery-partners" element={<AdminDeliveryPartners />} />
                        <Route path="/admin/order-assignments" element={<AdminOrderAssignments />} />
                        <Route path="/admin/analytics" element={<AdminAnalytics />} />
                        <Route path="/admin/inventory" element={<AdminInventory />} />
                        <Route path="/admin/users" element={<AdminUsers />} />
                        <Route path="/admin/mlm-settings" element={<SuperAdminGuard><MLMSettings /></SuperAdminGuard>} />
                        <Route path="/admin/withdrawals" element={<SuperAdminGuard><AdminWithdrawals /></SuperAdminGuard>} />
                        <Route path="/admin/network-analytics" element={<SuperAdminGuard><NetworkAnalytics /></SuperAdminGuard>} />
                        <Route path="/admin/testimonials" element={<AdminTestimonials />} />
                        <Route path="/admin/banners" element={<AdminBanners />} />
                        <Route path="/admin/advertisements" element={<AdminAdvertisements />} />
                        <Route path="/admin/founders" element={<SuperAdminGuard><AdminFounders /></SuperAdminGuard>} />
                        <Route path="/admin/founder-payments" element={<SuperAdminGuard><AdminFounderPayments /></SuperAdminGuard>} />
                        <Route path="/admin/gst-report" element={<SuperAdminGuard><AdminGSTReport /></SuperAdminGuard>} />
                        <Route path="/admin/payment-recovery" element={<SuperAdminGuard><AdminPaymentRecovery /></SuperAdminGuard>} />

                        <Route path="/admin/return-requests" element={<AdminReturnRequests />} />
                        <Route path="/admin/policies" element={<AdminPolicies />} />
                        <Route path="/admin/stores" element={<AdminStores />} />
                        <Route path="/admin/stores/:id/inventory" element={<AdminStoreInventory />} />
                        {/* MLM Admin Routes */}
                        <Route path="/mlm-login" element={<MLMLogin />} />
                        <Route path="/mlm-admin" element={<MLMDashboard />} />
                        <Route path="/mlm-admin/network-analytics" element={<LayoutOverrideProvider value={MLMAdminLayout}><NetworkAnalytics /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/users" element={<LayoutOverrideProvider value={MLMAdminLayout}><AdminUsers /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/founding-members" element={<LayoutOverrideProvider value={MLMAdminLayout}><FoundingMembers /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/referral-codes" element={<LayoutOverrideProvider value={MLMAdminLayout}><ReferralCodes /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/founders" element={<LayoutOverrideProvider value={MLMAdminLayout}><AdminFounders /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/mlm-settings" element={<LayoutOverrideProvider value={MLMAdminLayout}><MLMSettings /></LayoutOverrideProvider>} />
                        <Route path="/mlm-admin/withdrawals" element={<LayoutOverrideProvider value={MLMAdminLayout}><AdminWithdrawals /></LayoutOverrideProvider>} />
                        <Route path="/policies" element={<Policies />} />
                        <Route path="/stores" element={<StoreLocator />} />
                        <Route path="/policies/:slug" element={<Policies />} />
                        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
                        <Route path="/user-agreement" element={<UserAgreementPage />} />
                        <Route path="/complete-registration" element={<CompleteRegistration />} />

                        <Route path="/registration-payment" element={<RegistrationPayment />} />
                        <Route path="/account-deletion" element={<AccountDeletion />} />
                        <Route path="/delete-account" element={<AccountDeletion />} />
                        {/* Mobile App Entry Points */}
                        <Route path="/mobile-apps" element={<MobileApps />} />
                        <Route path="/driver-app" element={<DriverApp />} />
                        <Route path="/driver-app/orders" element={<DriverOrdersPage />} />
                        <Route path="/driver-app/earnings" element={<DriverEarningsPage />} />
                        <Route path="/driver-app/profile" element={<DriverProfilePage />} />
                        <Route path="/customer-app" element={<CustomerApp />} />
                        <Route path="/customer-app/orders" element={<CustomerOrdersPage />} />
                        <Route path="/customer-app/order/:orderId" element={<CustomerOrderDetailPage />} />
                        <Route path="/customer-app/wallet" element={<CustomerWalletPage />} />
                        <Route path="/customer-app/profile" element={<AppErrorBoundary><CustomerProfilePage /></AppErrorBoundary>} />
                        <Route path="/customer-app/addresses" element={<CustomerAddressesPage />} />
                        <Route path="/member-app/addresses" element={<CustomerAddressesPage />} />
                        <Route path="/member-app" element={<MemberApp />} />
                        <Route path="/member-app/shop" element={<MemberShopPage />} />
                        <Route path="/member-app/network" element={<MemberNetworkPage />} />
                        <Route path="/member-app/wallet" element={<CustomerWalletPage />} />
                        <Route path="/member-app/profile" element={<AppErrorBoundary><CustomerProfilePage /></AppErrorBoundary>} />
                        {/* PWA Install Pages */}
                        <Route path="/install/customer" element={<CustomerInstall />} />
                        <Route path="/install/driver" element={<DriverInstall />} />
                        <Route path="/install/member" element={<MemberInstall />} />
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </WishlistProvider>
                </CartProvider>
              </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
