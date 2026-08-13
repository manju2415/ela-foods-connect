import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { isValidIfscFormat, lookupIfsc, IfscDetails } from "@/lib/ifsc";

interface IfscInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onVerified?: (details: IfscDetails | null) => void;
  placeholder?: string;
}

export function IfscInput({ id, value, onChange, onVerified, placeholder }: IfscInputProps) {
  const [checking, setChecking] = useState(false);
  const [details, setDetails] = useState<IfscDetails | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const code = value.trim().toUpperCase();
    setDetails(null);
    setInvalid(false);
    onVerified?.(null);

    if (code.length !== 11) return;
    if (!isValidIfscFormat(code)) {
      setInvalid(true);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const result = await lookupIfsc(code);
      if (cancelled) return;
      setChecking(false);
      setDetails(result);
      setInvalid(!result);
      onVerified?.(result);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder || "SBIN0001234"}
          maxLength={11}
          autoComplete="off"
          className={`uppercase pr-10 ${details ? "border-green-500" : invalid ? "border-destructive" : ""}`}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && details && <Check className="h-4 w-4 text-green-600" />}
          {!checking && invalid && <AlertCircle className="h-4 w-4 text-destructive" />}
        </div>
      </div>
      {details && (
        <p className="text-sm text-green-600">
          {details.bank} — {details.branch}
          {details.city ? `, ${details.city}` : ""}
        </p>
      )}
      {invalid && !checking && (
        <p className="text-sm text-destructive">Could not verify this IFSC code. Please check and try again.</p>
      )}
    </div>
  );
}
