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

// Small stacked tiles (icon above label) so three fit in the narrow address column.
const TILE = "h-auto flex-col gap-1 border bg-background px-1 py-2 text-xs";

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
    <div className="mt-3 max-w-sm rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <MapPin className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Delivery pin confirmed</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{formatLatLng(location)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${TILE} border-primary/40 ${SOFT_OUTLINE_HOVER}`}
          aria-label="View location in Google Maps"
          onClick={() => window.open(link, "_blank")}
        >
          <ExternalLink /> Maps
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${TILE} border-primary/40 ${SOFT_OUTLINE_HOVER}`}
          aria-label="Copy location link"
          onClick={copyLink}
        >
          <Copy /> Copy link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${TILE} border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400`}
          aria-label="Share location via WhatsApp"
          onClick={() => window.open(whatsappShareLink(buildDeliveryShareMessage(orderNumber, shippingAddress, location)), "_blank")}
        >
          <Share2 /> WhatsApp
        </Button>
      </div>
    </div>
  );
}
