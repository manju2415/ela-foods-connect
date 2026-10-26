import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, MapPin, Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import {
  buildDeliveryShareMessage,
  formatLatLng,
  googleMapsLink,
  orderLocation,
  whatsappShareLink,
  type ShippingAddressLike,
} from "@/lib/deliveryLocation";

// Light tint on hover instead of the solid red fill (it also stuck solid red
// after a tap on touch screens).
const SOFT_OUTLINE_HOVER = "hover:bg-primary/10 hover:text-primary";

interface OrderLocationActionsProps {
  orderNumber: string;
  shippingAddress: ShippingAddressLike | null | undefined;
}

/**
 * Admin Order Details: the customer's confirmed map pin, read from this
 * order's own shipping_address. Orders placed without a pin (all older
 * orders, store pickup, guest checkout) just show a note.
 */
export function OrderLocationActions({ orderNumber, shippingAddress }: OrderLocationActionsProps) {
  const location = orderLocation(shippingAddress);

  if (!location) {
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" /> No map location shared for this order
      </p>
    );
  }

  const link = googleMapsLink(location);

  const copyLink = async () => {
    if (await copyToClipboard(link)) toast.success("Location link copied");
    else toast.error(`Couldn't copy automatically. Link: ${link}`);
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 text-primary" /> Confirmed location: {formatLatLng(location)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className={SOFT_OUTLINE_HOVER} onClick={() => window.open(link, "_blank")}>
          <ExternalLink className="h-4 w-4 mr-1" /> View Location
        </Button>
        <Button type="button" variant="outline" size="sm" className={SOFT_OUTLINE_HOVER} onClick={copyLink}>
          <Copy className="h-4 w-4 mr-1" /> Copy Location Link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={SOFT_OUTLINE_HOVER}
          onClick={() => window.open(whatsappShareLink(buildDeliveryShareMessage(orderNumber, shippingAddress, location)), "_blank")}
        >
          <Share2 className="h-4 w-4 mr-1" /> Share Location via WhatsApp
        </Button>
      </div>
    </div>
  );
}
