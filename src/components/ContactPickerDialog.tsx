import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, UserRound } from "lucide-react";
import { loadDeviceContacts, type PickedContact } from "@/lib/contacts";

interface ContactPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: PickedContact) => void;
}

export function ContactPickerDialog({ open, onOpenChange, onSelect }: ContactPickerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<PickedContact[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
    setLoading(true);
    loadDeviceContacts()
      .then(setContacts)
      .catch((err: Error) => {
        setError(
          err.message === "permission-denied"
            ? "Contacts permission was denied. Enable it in your phone settings > Apps > Ela Bazar > Permissions > Contacts."
            : "Could not read your contacts. Please enter the number manually."
        );
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          c.phone.includes(query.replace(/\D/g, ""))
      )
    : contacts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick a contact</DialogTitle>
          <DialogDescription>Choose someone from your phone's contacts.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading contacts...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6">{error}</p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus={false}
                placeholder="Search name or number"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto -mx-2 px-2 flex-1 min-h-[120px]">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No contacts found.</p>
              ) : (
                <ul className="divide-y">
                  {filtered.slice(0, 300).map((c) => (
                    <li key={`${c.phone}-${c.name}`}>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start h-auto py-3"
                        onClick={() => {
                          onSelect(c);
                          onOpenChange(false);
                        }}
                      >
                        <UserRound className="h-4 w-4 mr-3 shrink-0 text-muted-foreground" />
                        <span className="text-left">
                          <span className="block font-medium">{c.name || "Unnamed"}</span>
                          <span className="block text-xs text-muted-foreground">{c.phone}</span>
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
