import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap } from "lucide-react";
import { useShippingSettings } from "@/hooks/useShippingSettings";
import { HIDDEN_EXPRESS_CODES, clockLabel, etaLabel, fetchExpressQuote, type ExpressQuote } from "@/lib/expressDelivery";

interface ExpressDeliveryOptionProps {
  // The selected address's confirmed map pin.
  latitude?: number | null;
  longitude?: number | null;
  productIds: string[];
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  // The latest server answer (null while checking or when Express is off).
  onQuoteChange: (quote: ExpressQuote | null) => void;
  // Bump to re-check now (e.g. after the server turned an order away).
  recheckKey?: number;
}

// Standard vs Express choice for home delivery. Renders nothing unless an
// admin has switched Express on, so checkout is unchanged until then.
export const ExpressDeliveryOption = ({
  latitude,
  longitude,
  productIds,
  selected,
  onSelectedChange,
  onQuoteChange,
  recheckKey = 0,
}: ExpressDeliveryOptionProps) => {
  const { expressSettings } = useShippingSettings();
  const [quote, setQuote] = useState<ExpressQuote | null>(null);
  // Re-checked every minute so Express closes on time at the cutoff.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const productKey = [...productIds].sort().join(",");
  const inputKey = `${latitude ?? ""}|${longitude ?? ""}|${productKey}|${expressSettings.enabled}`;

  // New address, pin or cart: forget the old answer until the new one arrives.
  useEffect(() => {
    setQuote(null);
    onQuoteChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  useEffect(() => {
    if (!expressSettings.enabled) return;
    let cancelled = false;
    fetchExpressQuote(latitude, longitude, productKey ? productKey.split(",") : []).then((result) => {
      if (cancelled) return;
      setQuote(result);
      onQuoteChange(result);
      if (!result.eligible) onSelectedChange(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey, tick, recheckKey]);

  if (!expressSettings.enabled || !quote || HIDDEN_EXPRESS_CODES.includes(quote.code)) return null;

  const fee = quote.fee ?? expressSettings.fee;
  const eta = etaLabel(quote.eta_minutes ?? expressSettings.eta_minutes);
  const value = selected && quote.eligible ? "express" : "standard";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Delivery Speed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <RadioGroup
          value={value}
          onValueChange={(v) => onSelectedChange(v === "express" && quote.eligible)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <label
            htmlFor="speed-standard"
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              value === "standard" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <RadioGroupItem value="standard" id="speed-standard" className="mt-0.5" />
            <span>
              <span className="block font-medium text-sm">Standard Delivery</span>
              <span className="block text-xs text-muted-foreground">Choose a delivery slot below</span>
            </span>
          </label>
          <label
            htmlFor="speed-express"
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              !quote.eligible
                ? "border-border opacity-60 cursor-not-allowed"
                : value === "express"
                  ? "border-primary bg-primary/5 cursor-pointer"
                  : "border-border hover:border-primary/50 cursor-pointer"
            }`}
          >
            <RadioGroupItem value="express" id="speed-express" disabled={!quote.eligible} className="mt-0.5" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">Express Delivery</span>
                <span className="text-sm font-medium">+₹{fee}</span>
              </span>
              <span className="block text-xs text-muted-foreground">Delivered today within {eta}</span>
            </span>
          </label>
        </RadioGroup>
        {quote.eligible ? (
          <p className="text-xs text-muted-foreground">
            {quote.distance_km !== undefined && quote.store_name ? `${quote.distance_km} km from ${quote.store_name}. ` : ""}
            {quote.available_until ? `Express orders are taken until ${clockLabel(quote.available_until)}.` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{quote.reason}</p>
        )}
      </CardContent>
    </Card>
  );
};
