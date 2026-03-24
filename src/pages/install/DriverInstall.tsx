import { MapPin, Clock, Wallet, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Link } from "react-router-dom";

export default function DriverInstall() {
  const { isInstallable, isInstalled, isIOS, installApp } = usePWAInstall();

  const handleInstall = async () => {
    if (isIOS) {
      alert("To install: Tap the Share button, then 'Add to Home Screen'");
    } else {
      await installApp();
    }
  };

  const features = [
    { icon: MapPin, title: "Navigation", description: "Turn-by-turn directions" },
    { icon: Clock, title: "Schedule", description: "Manage your deliveries" },
    { icon: Wallet, title: "Earnings", description: "Track your income" },
    { icon: Bell, title: "Notifications", description: "Real-time order alerts" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="container max-w-md mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 rounded-3xl bg-[#16a34a] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-5xl">🚚</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Ela Bazar Delivery</h1>
          <p className="text-muted-foreground">Deliver with Ela Bazar</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card border rounded-xl p-4">
              <feature.icon className="h-8 w-8 text-[#16a34a] mb-2" />
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
                Look for the ELA Delivery icon on your home screen
              </p>
              <Link to="/driver-app">
                <Button className="w-full bg-[#16a34a] hover:bg-[#15803d]">
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
                className="w-full bg-[#16a34a] hover:bg-[#15803d]"
                onClick={handleInstall}
                disabled={!isInstallable && !isIOS}
              >
                {isIOS ? "View Instructions" : "Install App"}
              </Button>
              
              <Link to="/driver-app" className="block mt-4">
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
