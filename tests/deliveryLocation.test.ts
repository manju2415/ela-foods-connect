// Delivery location pin: links, WhatsApp message, and old-order handling.
// Run: npx -y deno test --allow-read tests/
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1";
import {
  buildDeliveryShareMessage,
  formatDeliveryAddress,
  geolocationFailureMessage,
  googleMapsLink,
  orderLocation,
  parseLatLng,
  roundCoordinate,
  whatsappShareLink,
} from "../src/lib/deliveryLocation.ts";

const read = (path: string) => Deno.readTextFileSync(new URL(`../${path}`, import.meta.url));

const address = {
  full_name: "Asha Kumar",
  phone: "9876543210",
  email: "asha@example.com",
  address_line1: "12 MG Road",
  address_line2: "Flat 4B & Co",
  city: "Bengaluru",
  state: "Karnataka",
  postal_code: "560001",
  latitude: 12.971599,
  longitude: 77.594566,
};

Deno.test("older orders and store pickup (no pin) have no location", () => {
  assertEquals(orderLocation({ address_line1: "12 MG Road", city: "Bengaluru" }), null);
  assertEquals(orderLocation({ latitude: null, longitude: null }), null);
  assertEquals(orderLocation(null), null);
  assertEquals(orderLocation(undefined), null);
  assertEquals(orderLocation({} as never), null);
});

Deno.test("invalid or partial coordinates are ignored", () => {
  assertEquals(parseLatLng(12.9, null), null);
  assertEquals(parseLatLng(91, 77), null);
  assertEquals(parseLatLng(12, 181), null);
  assertEquals(parseLatLng(0, 0), null);
  assertEquals(parseLatLng("abc", 77), null);
  assertEquals(parseLatLng("", ""), null);
  assertEquals(parseLatLng("12.5", "77.25"), { latitude: 12.5, longitude: 77.25 });
});

Deno.test("the pin saved with the order is the one read back", () => {
  assertEquals(orderLocation(address), { latitude: 12.971599, longitude: 77.594566 });
});

Deno.test("Google Maps link points at the exact coordinates", () => {
  assertEquals(
    googleMapsLink({ latitude: 12.971599, longitude: 77.594566 }),
    "https://www.google.com/maps/search/?api=1&query=12.971599%2C77.594566",
  );
});

Deno.test("coordinates are rounded to 6 decimals", () => {
  assertEquals(roundCoordinate(12.97159912345), 12.971599);
  assertEquals(roundCoordinate(77.5945664), 77.594566);
});

Deno.test("WhatsApp message has order, address, link — and no name, phone or email", () => {
  const msg = buildDeliveryShareMessage("ELA12345678", address, orderLocation(address)!);
  assertEquals(
    msg,
    [
      "Delivery Location",
      "",
      "Order ID: #ELA12345678",
      "",
      "Address: 12 MG Road, Flat 4B & Co, Bengaluru, Karnataka - 560001",
      "",
      "Google Maps: https://www.google.com/maps/search/?api=1&query=12.971599%2C77.594566",
    ].join("\n"),
  );
  assertFalse(msg.includes("Asha"));
  assertFalse(msg.includes("9876543210"));
  assertFalse(msg.includes("asha@example.com"));
});

Deno.test("delivery instructions are included only when present", () => {
  const loc = orderLocation(address)!;
  assertFalse(buildDeliveryShareMessage("1", { ...address, delivery_instructions: "  " }, loc).includes("Delivery Instructions"));
  assertMatch(
    buildDeliveryShareMessage("1", { ...address, delivery_instructions: "Ring twice" }, loc),
    /\n\nDelivery Instructions: Ring twice$/,
  );
});

Deno.test("WhatsApp link has no recipient and fully encodes the message", () => {
  const msg = buildDeliveryShareMessage("ELA1", address, orderLocation(address)!);
  const link = whatsappShareLink(msg);
  assert(link.startsWith("https://wa.me/?text="));
  assertFalse(/[\s&#]/.test(link.slice("https://wa.me/?text=".length)), "no raw spaces, & or # in the text param");
  assertEquals(new URL(link).searchParams.get("text"), msg);
  // The maps link inside survives the round trip intact.
  assert(new URL(link).searchParams.get("text")!.includes("query=12.971599%2C77.594566"));
});

Deno.test("address line skips missing parts", () => {
  assertEquals(formatDeliveryAddress({ address_line1: "12 MG Road", city: "Bengaluru", postal_code: "560001" }), "12 MG Road, Bengaluru - 560001");
  assertEquals(formatDeliveryAddress(null), "");
});

Deno.test("every geolocation failure keeps the manual option open", () => {
  for (const reason of ["denied", "unavailable", "timeout", "unsupported"] as const) {
    assertMatch(geolocationFailureMessage(reason), /pin|typed address/i);
  }
});

Deno.test("location is read once on tap — never watched or tracked", () => {
  const sources = [
    "src/lib/deliveryLocation.ts",
    "src/components/checkout/DeliveryLocationPicker.tsx",
    "src/components/checkout/LocationMap.tsx",
  ].map(read).join("\n");
  assertFalse(sources.includes("watchPosition"));
  assertEquals((sources.match(/getCurrentPosition\(/g) || []).length, 1);
});

Deno.test("checkout's order placement is untouched: the pin rides along in the address spread", () => {
  const checkout = read("src/pages/Checkout.tsx");
  assert(checkout.includes("selectedAddress ? { ...selectedAddress, email: validEmail } : {}"));
  assert(checkout.includes("<DeliveryLocationPicker"));
});

Deno.test("migration is additive only", () => {
  const sql = read("supabase/migrations/20261026000000_address_delivery_location.sql");
  assertFalse(/\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+public\./i.test(sql));
  assert(sql.includes("ADD COLUMN IF NOT EXISTS latitude double precision"));
});
