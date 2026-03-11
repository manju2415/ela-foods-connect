import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Phone, Clock, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const StoreLocator = () => {
  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["public-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Our Stores</h1>
          <p className="text-muted-foreground">Visit us at any of our physical locations</p>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : stores.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No stores available at the moment.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map(store => (
              <Card key={store.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                {store.image_url && (
                  <img src={store.image_url} alt={store.name} className="w-full h-40 object-cover" />
                )}
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-lg font-semibold">{store.name}</h3>

                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {store.address_line1}
                      {store.address_line2 && `, ${store.address_line2}`}
                      , {store.city}, {store.state} {store.postal_code}
                    </span>
                  </div>

                  {store.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" />
                      <a href={`tel:${store.phone}`} className="hover:text-primary">{store.phone}</a>
                    </div>
                  )}

                  {store.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <a href={`mailto:${store.email}`} className="hover:text-primary">{store.email}</a>
                    </div>
                  )}

                  {store.opening_time && store.closing_time && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{store.opening_time.slice(0, 5)} — {store.closing_time.slice(0, 5)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default StoreLocator;
