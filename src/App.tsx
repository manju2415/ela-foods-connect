import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { AppErrorBoundary } from "@/components/errors/AppErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import About from "./pages/About";
import Contact from "./pages/Contact";
import DeliveryDashboard from "./pages/DeliveryDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import FoundingMembers from "./pages/admin/FoundingMembers";
import ReferralCodes from "./pages/admin/ReferralCodes";
import AdminOrders from "./pages/admin/Orders";
import AdminProducts from "./pages/admin/Products";
import AdminCategories from "./pages/admin/Categories";
import AdminCoupons from "./pages/admin/Coupons";
import AdminSettings from "./pages/admin/Settings";
import AdminDeliveryPartners from "./pages/admin/DeliveryPartners";
import AdminOrderAssignments from "./pages/admin/OrderAssignments";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminInventory from "./pages/admin/Inventory";
import AdminUsers from "./pages/admin/Users";
import MLMSettings from "./pages/admin/MLMSettings";
import AdminWithdrawals from "./pages/admin/Withdrawals";
import NetworkAnalytics from "./pages/admin/NetworkAnalytics";
import AdminTestimonials from "./pages/admin/Testimonials";
import AdminBanners from "./pages/admin/Banners";
import AdminFounders from "./pages/admin/Founders";
import AdminReturnRequests from "./pages/admin/ReturnRequests";
import AdminPolicies from "./pages/admin/Policies";
import AdminStores from "./pages/admin/Stores";
import AdminStoreInventory from "./pages/admin/StoreInventory";
import StoreLocator from "./pages/StoreLocator";
import Policies from "./pages/Policies";
import AdminAdvertisements from "./pages/admin/Advertisements";
import GuestCheckout from "./pages/GuestCheckout";
import RegistrationPayment from "./pages/RegistrationPayment";
import CompleteRegistration from "./pages/CompleteRegistration";
import NotFound from "./pages/NotFound";
import MLMLogin from "./pages/MLMLogin";
import MLMDashboard from "./pages/mlm-admin/MLMDashboard";
import { LayoutOverrideProvider } from "./contexts/AdminLayoutContext";
import { MLMAdminLayout } from "./components/mlm-admin/MLMAdminLayout";
import DriverApp from "./pages/DriverApp";
import CustomerApp from "./pages/CustomerApp";
import MemberApp from "./pages/MemberApp";
import MobileApps from "./pages/MobileApps";
import CategoryPage from "./pages/CategoryPage";
// Mobile Customer Pages
import CustomerOrdersPage from "./pages/mobile/customer/OrdersPage";
import CustomerOrderDetailPage from "./pages/mobile/customer/OrderDetailPage";
import CustomerWalletPage from "./pages/mobile/customer/WalletPage";
import CustomerProfilePage from "./pages/mobile/customer/ProfilePage";
// Mobile Driver Pages
import DriverOrdersPage from "./pages/mobile/driver/OrdersPage";
import DriverEarningsPage from "./pages/mobile/driver/EarningsPage";
import DriverProfilePage from "./pages/mobile/driver/ProfilePage";
// Mobile Member Pages
import MemberNetworkPage from "./pages/mobile/member/NetworkPage";
// PWA Install Pages
import CustomerInstall from "./pages/install/CustomerInstall";
import DriverInstall from "./pages/install/DriverInstall";
import MemberInstall from "./pages/install/MemberInstall";

const queryClient = new QueryClient();

function App() {
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
              <BrowserRouter>
                <CartProvider>
                  <WishlistProvider>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/shop" element={<Index />} />
                      <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
                      <Route path="/products" element={<Products />} />
                      <Route path="/categories" element={<Products />} />
                      <Route path="/category/:slug" element={<CategoryPage />} />
                      <Route path="/category/:slug/:subSlug" element={<CategoryPage />} />
                      <Route path="/product/:slug" element={<ProductDetail />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/guest-checkout" element={<GuestCheckout />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/delivery" element={<DeliveryDashboard />} />
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/admin/founding-members" element={<FoundingMembers />} />
                      <Route path="/admin/referral-codes" element={<ReferralCodes />} />
                      <Route path="/admin/orders" element={<AdminOrders />} />
                      <Route path="/admin/products" element={<AdminProducts />} />
                      <Route path="/admin/categories" element={<AdminCategories />} />
                      <Route path="/admin/coupons" element={<AdminCoupons />} />
                      <Route path="/admin/settings" element={<AdminSettings />} />
                      <Route path="/admin/delivery-partners" element={<AdminDeliveryPartners />} />
                      <Route path="/admin/order-assignments" element={<AdminOrderAssignments />} />
                      <Route path="/admin/analytics" element={<AdminAnalytics />} />
                      <Route path="/admin/inventory" element={<AdminInventory />} />
                      <Route path="/admin/users" element={<AdminUsers />} />
                      <Route path="/admin/mlm-settings" element={<MLMSettings />} />
                      <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
                      <Route path="/admin/network-analytics" element={<NetworkAnalytics />} />
                      <Route path="/admin/testimonials" element={<AdminTestimonials />} />
                      <Route path="/admin/banners" element={<AdminBanners />} />
                      <Route path="/admin/advertisements" element={<AdminAdvertisements />} />
                      <Route path="/admin/founders" element={<AdminFounders />} />
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
                      <Route path="/complete-registration" element={<CompleteRegistration />} />
                      <Route path="/registration-payment" element={<RegistrationPayment />} />
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
                      <Route path="/customer-app/profile" element={<CustomerProfilePage />} />
                      <Route path="/member-app" element={<MemberApp />} />
                      <Route path="/member-app/network" element={<MemberNetworkPage />} />
                      <Route path="/member-app/wallet" element={<CustomerWalletPage />} />
                      <Route path="/member-app/profile" element={<CustomerProfilePage />} />
                      {/* PWA Install Pages */}
                      <Route path="/install/customer" element={<CustomerInstall />} />
                      <Route path="/install/driver" element={<DriverInstall />} />
                      <Route path="/install/member" element={<MemberInstall />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
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
