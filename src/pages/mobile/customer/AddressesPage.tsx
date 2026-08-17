import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import AddressManager from "@/components/AddressManager";

export default function CustomerAddressesPage() {
  return (
    <MobileAppLayout appType="customer">
      <div className="min-h-screen bg-background">
        <MobileHeader title="My Addresses" showBack />
        <main className="p-4 pb-24"><AddressManager /></main>
      </div>
    </MobileAppLayout>
  );
}