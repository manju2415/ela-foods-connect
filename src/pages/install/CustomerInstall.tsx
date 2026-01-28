import { ShoppingBag, Truck, CreditCard, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Link } from "react-router-dom";

export default function CustomerInstall() {
  const { isInstallable, isInstalled, isIOS, installApp } = usePWAInstall();

  const handleInstall = async () => {
    if (isIOS) {
      // Show iOS instructions
      alert("To install: Tap the Share button, then 'Add to Home Screen'");
    } else {
      await installApp();
    }
  };

  const features = [
    { icon: ShoppingBag, title: "Easy Shopping", description: "Browse and order premium snacks" },
    { icon: Truck, title: "Track Orders", description: "Real-time delivery tracking" },
    { icon: CreditCard, title: "Secure Payments", description: "Multiple payment options" },
    { icon: Heart, title: "Wishlist", description: "Save your favorite items" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="container max-w-md mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-[#f97316] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-5xl">🍽️</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">ELA Foods</h1>
          <p className="text-muted-foreground">Mother's Touch - Premium Homemade Snacks</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card border rounded-xl p-4">
              <feature.icon className="h-8 w-8 text-[#f97316] mb-2" />
              <h3 className="font-semibold text-sm">{feature.title}</h3>
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Install Section */}
        <div className="bg-card border rounded-2xl p-6 text-center">
          {isInstalled ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <h2 className="text-xl font-semibold mb-2">App Installed!</h2>
              <p className="text-muted-foreground mb-4">
                Look for the ELA Foods icon on your home screen
              </p>
              <Link to="/customer-app">
                <Button className="w-full bg-[#f97316] hover:bg-[#ea580c]">
                  Open App
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Install the App</h2>
              <p className="text-muted-foreground mb-4">
                {isIOS
                  ? "Add to your home screen for the best experience"
                  : "Install for quick access and offline support"}
              </p>
              
              {isIOS ? (
                <div className="text-left bg-muted rounded-lg p-4 mb-4">
                  <p className="font-medium mb-2">How to install:</p>
                  <ol className="text-sm text-muted-foreground space-y-1">
                    <li>1. Tap the Share button <span className="inline-block">⬆️</span></li>
                    <li>2. Scroll and tap "Add to Home Screen"</li>
                    <li>3. Tap "Add" to confirm</li>
                  </ol>
                </div>
              ) : null}
              
              <Button 
                className="w-full bg-[#f97316] hover:bg-[#ea580c]"
                onClick={handleInstall}
                disabled={!isInstallable && !isIOS}
              >
                {isIOS ? "View Instructions" : "Install App"}
              </Button>
              
              <Link to="/customer-app" className="block mt-4">
                <Button variant="outline" className="w-full">
                  Continue in Browser
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
