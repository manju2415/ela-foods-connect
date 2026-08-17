import { Button } from "@/components/ui/button";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useFCMPushNotifications } from "@/hooks/useFCMPushNotifications";

export function EnableNotificationsButton() {
  const { isSupported, permissionStatus, requestPermission } = useFCMPushNotifications();
  if (!isSupported) return null;
  const enabled = permissionStatus === "granted";
  return (
    <Button type="button" variant="outline" className="w-full justify-start" disabled={enabled} onClick={async () => {
      const granted = await requestPermission();
      granted ? toast.success("Notifications enabled") : toast.error("Notification permission was not enabled");
    }}>
      {enabled ? <BellRing className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
      {enabled ? "Notifications enabled" : "Enable notifications"}
    </Button>
  );
}