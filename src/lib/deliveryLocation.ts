/**
 * Customer-confirmed delivery location (map pin) helpers.
 *
 * The pin is saved on the address row (addresses.latitude/longitude) and
 * reaches the order unchanged inside orders.shipping_address, because checkout
 * already sends the whole address row as the shipping address.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Shipping-address fields this module reads (all optional: older orders have none). */
export interface ShippingAddressLike {
  full_name?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  delivery_instructions?: unknown;
}

// Map opens here when there's no pin and no GPS (Bengaluru, where we deliver).
export const DEFAULT_MAP_CENTER: LatLng = { latitude: 12.9716, longitude: 77.5946 };

export const LOCATION_CONSENT_TEXT =
  "Allow location access to select your delivery address accurately. Your confirmed location will only be used for order delivery and may be shared with the assigned delivery partner.";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Valid coordinates, or null. (0,0) is treated as "no pin" — it's never a real delivery point. */
export function parseLatLng(latitude: unknown, longitude: unknown): LatLng | null {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

/** The confirmed pin stored on an order's shipping address, if any. */
export function orderLocation(address: ShippingAddressLike | null | undefined): LatLng | null {
  if (!address || typeof address !== "object") return null;
  return parseLatLng(address.latitude, address.longitude);
}

/** ~10 cm precision; keeps stored values and links short. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function formatLatLng({ latitude, longitude }: LatLng): string {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** Google Maps link that drops a pin on the exact coordinates (no API key needed). */
export function googleMapsLink(location: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatLatLng(location))}`;
}

/** One-line delivery address (no name/phone — those aren't needed to find the place). */
export function formatDeliveryAddress(address: ShippingAddressLike | null | undefined): string {
  if (!address) return "";
  const place = [address.address_line1, address.address_line2, address.city, address.state]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const pin = typeof address.postal_code === "string" ? address.postal_code.trim() : "";
  return [place, pin].filter(Boolean).join(" - ");
}

/**
 * Prefilled message for the Rapido / Porter rider. Deliberately leaves out the
 * customer's name, phone and email — the rider gets those through the booking.
 */
export function buildDeliveryShareMessage(
  orderNumber: string,
  address: ShippingAddressLike | null | undefined,
  location: LatLng,
): string {
  const instructions = typeof address?.delivery_instructions === "string" ? address.delivery_instructions.trim() : "";
  const lines = [
    "Delivery Location",
    "",
    `Order ID: #${orderNumber.replace(/^#/, "")}`,
    "",
    `Address: ${formatDeliveryAddress(address) || "-"}`,
    "",
    `Google Maps: ${googleMapsLink(location)}`,
  ];
  if (instructions) lines.push("", `Delivery Instructions: ${instructions}`);
  return lines.join("\n");
}

/**
 * WhatsApp share link with no recipient: WhatsApp (app or WhatsApp Web) opens
 * its contact picker with the message filled in; the admin picks the rider
 * and taps Send. Nothing is sent automatically.
 */
export function whatsappShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export type GeolocationFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export function geolocationFailureMessage(reason: GeolocationFailure): string {
  switch (reason) {
    case "denied":
      return "Location permission was denied. You can drag the pin or tap the map to mark your location, or just continue with your typed address.";
    case "timeout":
      return "Finding your location took too long. Try again, or drag the pin / tap the map to mark your location.";
    case "unsupported":
      return "This device or browser can't share its location. Drag the pin or tap the map to mark your location.";
    default:
      return "Your location couldn't be found right now. Check that location (GPS) is on, or drag the pin / tap the map to mark your location.";
  }
}
