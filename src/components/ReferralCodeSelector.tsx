import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ReferralCode {
  code: string;
  user_id: string;
  owner_name: string | null;
  owner_email: string;
}

interface ReferralCodeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ReferralCodeSelector({
  value,
  onChange,
  disabled,
  placeholder = "Select referral code...",
}: ReferralCodeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      // Get all active referral codes
      const { data: codesData, error } = await supabase
        .from("referral_codes")
        .select("code, user_id")
        .eq("is_active", true)
        .order("code");

      if (error) throw error;

      if (!codesData || codesData.length === 0) {
        setCodes([]);
        setLoading(false);
        return;
      }

      // Get owner profiles
      const userIds = codesData.map((c) => c.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const enrichedCodes: ReferralCode[] = codesData.map((c) => {
        const profile = profilesMap.get(c.user_id);
        return {
          code: c.code,
          user_id: c.user_id,
          owner_name: profile?.full_name || null,
          owner_email: profile?.email || "",
        };
      });

      setCodes(enrichedCodes);
    } catch (error) {
      console.error("Failed to fetch referral codes:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCodes = useMemo(() => {
    if (!search) return codes;
    const lowerSearch = search.toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(lowerSearch) ||
        c.owner_name?.toLowerCase().includes(lowerSearch) ||
        c.owner_email.toLowerCase().includes(lowerSearch)
    );
  }, [codes, search]);

  const selectedCode = codes.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {value ? (
            <span className="flex items-center gap-2">
              <span className="font-mono font-semibold">{value}</span>
              {selectedCode?.owner_name && (
                <span className="text-muted-foreground">
                  ({selectedCode.owner_name})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 bg-popover" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by code or owner..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCodes.length === 0 ? (
              <CommandEmpty>No referral code found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredCodes.map((code) => (
                  <CommandItem
                    key={code.code}
                    value={code.code}
                    onSelect={() => {
                      onChange(code.code);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === code.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-mono font-semibold">{code.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {code.owner_name || "Unknown"} • {code.owner_email}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
