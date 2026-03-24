import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, ShoppingBag, Users, Download } from "lucide-react";

/**
 * Mobile App Selector
 * Allows users to choose which app experience they want to use
 */
export default function MobileApps() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Ela Bazar Apps</h1>
          <p className="text-muted-foreground">Choose your app experience</p>
        </div>

        <Link to="/customer-app">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-full">
                  <ShoppingBag className="h-6 w-6 text-primary" />
                </div>
                Customer App
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Browse products, place orders, and track your deliveries
              </CardDescription>
              <Link to="/install/customer" className="inline-flex items-center gap-1 text-sm text-primary mt-2 hover:underline">
                <Download className="h-3 w-3" /> Install App
              </Link>
            </CardContent>
          </Card>
        </Link>

        <Link to="/driver-app">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Truck className="h-6 w-6 text-blue-600" />
                </div>
                Driver App
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Manage deliveries, track earnings, and navigate to customers
              </CardDescription>
              <Link to="/install/driver" className="inline-flex items-center gap-1 text-sm text-primary mt-2 hover:underline">
                <Download className="h-3 w-3" /> Install App
              </Link>
            </CardContent>
          </Card>
        </Link>

        <Link to="/member-app">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-full">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                Member App
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                View your network, referrals, wallet, and earnings
              </CardDescription>
              <Link to="/install/member" className="inline-flex items-center gap-1 text-sm text-primary mt-2 hover:underline">
                <Download className="h-3 w-3" /> Install App
              </Link>
            </CardContent>
          </Card>
        </Link>

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
            Continue to Website →
          </Link>
        </div>
      </div>
    </div>
  );
}
