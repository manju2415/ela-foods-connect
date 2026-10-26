import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, Crosshair, Loader2, MapPin } from "lucide-react";
import { LocationMap } from "./LocationMap";
import {
  DEFAULT_MAP_CENTER,
  LOCATION_CONSENT_TEXT,
  geolocationFailureMessage,
  parseLatLng,
  roundCoordinate,
  type GeolocationFailure,
  type LatLng,
} from "@/lib/deliveryLocation";

/** One-time position read, started only by the customer's tap. Never watches or tracks. */
function getCurrentLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject("unsupported" satisfies GeolocationFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        // 1 = PERMISSION_DENIED, 3 = TIMEOUT (numeric: some WebViews lack the constants)
        const reason: GeolocationFailure = error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable";
        reject(reason);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

// Light tint on hover instead of the solid red fill, so these optional controls
// stay quiet and don't stick solid red after a tap on touch screens.
const SOFT_OUTLINE_HOVER = "hover:bg-primary/10 hover:text-primary";

export interface ConfirmedLocation extends LatLng {
  location_confirmed_at: string;
}

interface DeliveryLocationPickerProps {
  address: { id: string; latitude?: number | null; longitude?: number | null } | undefined;
  onConfirmed: (addressId: string, location: ConfirmedLocation) => void;
}

/**
 * Optional "pin my exact location" control for the selected delivery address.
 * Location permission is asked only when the customer taps "Use My Current
 * Location"; they can also just drag the pin, or skip this entirely.
 */
export function DeliveryLocationPicker({ address, onConfirmed }: DeliveryLocationPickerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<LatLng>(DEFAULT_MAP_CENTER);
  const [hasPin, setHasPin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!address) return null;
  const savedPin = parseLatLng(address.latitude, address.longitude);

  const openPicker = () => {
    setPosition(savedPin ?? DEFAULT_MAP_CENTER);
    setHasPin(!!savedPin);
    setLocateError(null);
    setOpen(true);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const found = await getCurrentLocation();
      setPosition({ latitude: roundCoordinate(found.latitude), longitude: roundCoordinate(found.longitude) });
      setHasPin(true);
    } catch (reason) {
      setLocateError(geolocationFailureMessage(reason as GeolocationFailure));
    } finally {
      setLocating(false);
    }
  };

  const confirm = async () => {
    setSaving(true);
    const location: ConfirmedLocation = { ...position, location_confirmed_at: new Date().toISOString() };
    // Saved on the address so it's reused next time. If this fails the pin is
    // still used for this order (it travels with the shipping address).
    const { error } = await supabase.from("addresses").update(location).eq("id", address.id);
    if (error) console.warn("Could not save the pin on the address:", error.message);
    onConfirmed(address.id, location);
    setSaving(false);
    setOpen(false);
    toast({ title: "Location confirmed", description: "Your delivery location has been pinned for this address." });
  };

  return (
    <>
      {savedPin ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Check className="h-4 w-4 text-green-600" />
            Exact location pinned on map
          </span>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={openPicker}>
            Change
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className={`w-full border-dashed ${SOFT_OUTLINE_HOVER}`} onClick={openPicker}>
          <MapPin className="h-4 w-4 mr-2" />
          Pin exact location on map (optional)
        </Button>
      )}

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Location</DialogTitle>
            <DialogDescription>{LOCATION_CONSENT_TEXT}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button type="button" variant="outline" className={`w-full ${SOFT_OUTLINE_HOVER}`} onClick={useCurrentLocation} disabled={locating || saving}>
              {locating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />}
              {locating ? "Finding your location..." : "Use My Current Location"}
            </Button>
            {locateError && <p className="text-sm text-destructive">{locateError}</p>}

            {open && (
              <LocationMap
                position={position}
                onChange={(next) => {
                  setPosition(next);
                  setHasPin(true);
                }}
                className="h-64 sm:h-72"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Drag the pin or tap the map to set the exact spot. This is optional — your typed address is always used.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className={SOFT_OUTLINE_HOVER} onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!hasPin || saving || locating}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Location
            </Button>
          </DialogFooter>
          {!hasPin && (
            <p className="text-xs text-muted-foreground text-right -mt-2">
              Use your current location or move the pin to confirm.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
