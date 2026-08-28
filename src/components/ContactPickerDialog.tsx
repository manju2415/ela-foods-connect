import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, UserRound, Smartphone } from "lucide-react";
import {
  contactsErrorReason,
  isNativeContacts,
  loadDeviceContacts,
  pickContactNative,
  type PickedContact,
} from "@/lib/contacts";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 50;

interface ContactPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: PickedContact) => void;
}

type RegisteredMap = Record<string, { name: string | null; is_self: boolean }>;

export function ContactPickerDialog({ open, onOpenChange, onSelect }: ContactPickerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<PickedContact[]>([]);
  const [registered, setRegistered] = useState<RegisteredMap>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchRegistered = useCallback(async (list: PickedContact[]) => {
    if (list.length === 0) return;
    try {
      const { data, error: fnError } = await supabase.functions.invoke("check-phones-batch", {
        body: { phones: list.map((c) => c.phone) },
      });
      if (fnError) throw fnError;
      setRegistered((data?.registered as RegisteredMap) ?? {});
    } catch {
      // Dedup info is a nice-to-have; picking still works without it.
      setRegistered({});
    }
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      mode === "refresh" ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const list = await loadDeviceContacts();
        setContacts(list);
        await fetchRegistered(list);
      } catch (err) {
        setError(
          contactsErrorReason(err) === "permission-denied"
            ? "Contacts permission was denied. Enable it in your phone settings > Apps > Ela Bazar > Permissions > Contacts, then tap Refresh — or use your phone's contact chooser below."
            : "This app build can't read your full contact list. Use your phone's contact chooser instead, or enter the number manually."
        );
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [fetchRegistered]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setVisibleCount(PAGE_SIZE);
    load("initial");
  }, [open, load]);

  // Debounce search so large lists stay responsive
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
      setVisibleCount(PAGE_SIZE);
      listRef.current?.scrollTo({ top: 0 });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    if (!debouncedQuery) return contacts;
    const digits = debouncedQuery.replace(/\D/g, "");
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(debouncedQuery) ||
        (digits.length > 0 && c.phone.includes(digits))
    );
  }, [contacts, debouncedQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount((c) => c + PAGE_SIZE);
    }
  };

  const registeredCount = useMemo(
    () => contacts.filter((c) => registered[c.phone]).length,
    [contacts, registered]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick a contact</DialogTitle>
          <DialogDescription>
            {loading
              ? "Reading your phone's contacts..."
              : `${contacts.length} contacts${registeredCount ? ` · ${registeredCount} already registered` : ""}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading contacts...
          </div>
        ) : error ? (
          <div className="py-6 space-y-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={() => load("refresh")} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or number"
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Refresh contacts"
                onClick={() => load("refresh")}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div
              ref={listRef}
              onScroll={handleScroll}
              className="overflow-y-auto -mx-2 px-2 flex-1 min-h-[160px]"
            >
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No contacts found.</p>
              ) : (
                <ul className="divide-y">
                  {visible.map((c) => {
                    const existing = registered[c.phone];
                    return (
                      <li key={`${c.phone}-${c.name}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!!existing}
                          className="w-full justify-start h-auto py-3 disabled:opacity-60"
                          onClick={() => {
                            onSelect(c);
                            onOpenChange(false);
                          }}
                        >
                          <UserRound className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />
                          <span className="text-left flex-1 min-w-0">
                            <span className="block font-medium truncate">
                              {c.name || existing?.name || "Unnamed"}
                            </span>
                            <span className="block text-xs text-muted-foreground">{c.phone}</span>
                          </span>
                          {existing && (
                            <Badge variant="secondary" className="ml-2 shrink-0">
                              {existing.is_self ? "You" : "Already a user"}
                            </Badge>
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {hasMore && (
                <div className="py-3 text-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                    Load more ({filtered.length - visible.length} left)
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
