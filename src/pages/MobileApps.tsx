import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, ShoppingBag, Users, Download } from "lucide-react";

/**
 * Mobile App Selector
 * Allows users to choose which app experience they want to use
 */
export default function MobileApps() {
  const navigate = useNavigate();

  const apps = [
    {
      openPath: "/customer-app",
      installPath: "/install/customer",
      title: "Customer App",
      description: "Browse products, place orders, and track your deliveries",
      icon: ShoppingBag,
      iconWrapClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      openPath: "/driver-app",
      installPath: "/install/driver",
      title: "Driver App",
      description: "Manage deliveries, track earnings, and navigate to customers",
      icon: Truck,
      iconWrapClass: "bg-blue-100",
      iconClass: "text-blue-600",
    },
    {
      openPath: "/member-app",
      installPath: "/install/member",
      title: "Member App",
      description: "View your network, referrals, wallet, and earnings",
      icon: Users,
      iconWrapClass: "bg-green-100",
      iconClass: "text-green-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Ela Bazar Apps</h1>
          <p className="text-muted-foreground">Choose your app experience</p>
        </div>

        {apps.map((app) => (
          // Not an <a>/<Link> — it contains its own "Install App" link below,
          // and nesting an <a> inside an <a> is invalid HTML that made the
          // inner link's clicks unreliable.
          <Card
            key={app.openPath}
            role="link"
            tabIndex={0}
            onClick={() => navigate(app.openPath)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate(app.openPath);
            }}
            className="cursor-pointer hover:shadow-lg transition-shadow mb-4"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${app.iconWrapClass}`}>
                  <app.icon className={`h-6 w-6 ${app.iconClass}`} />
                </div>
                {app.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{app.description}</CardDescription>
              <Link
                to={app.installPath}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-sm text-primary mt-2 hover:underline"
              >
                <Download className="h-3 w-3" /> Install App
              </Link>
            </CardContent>
          </Card>
        ))}

        <div className="text-center mt-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
            Continue to Website →
          </Link>
        </div>
      </div>
    </div>
  );
}
