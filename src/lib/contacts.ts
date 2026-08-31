import { Capacitor } from "@capacitor/core";

export interface PickedContact {
  name: string;
  phone: string;
}

export const isNativeContacts = () => Capacitor.isNativePlatform();

export const isWebContactPickerSupported = () =>
  typeof navigator !== "undefined" &&
  "contacts" in navigator &&
  typeof window !== "undefined" &&
  "ContactsManager" in window;

/** True when either the native plugin or the browser picker can be used. */
export const isContactPickerAvailable = () =>
  isNativeContacts() || isWebContactPickerSupported();

const normalisePhone = (raw: string) => raw.replace(/\D/g, "").slice(-10);

/** Browser Contact Picker API (Chrome on Android). Returns null if cancelled. */
export async function pickContactWeb(): Promise<PickedContact | null> {
  const contactsApi = (navigator as unknown as {
    contacts: {
      select: (
        props: string[],
        opts: { multiple: boolean }
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  }).contacts;

  const [contact] = await contactsApi.select(["name", "tel"], { multiple: false });
  if (!contact) return null;
  return {
    name: contact.name?.[0] ?? "",
    phone: normalisePhone(contact.tel?.[0] ?? ""),
  };
}

/**
 * Native OS contact picker (Android/iOS). Opens the system picker so no
 * READ_CONTACTS permission prompt is needed. Returns null if cancelled.
 */
export async function pickContactNative(): Promise<PickedContact | null> {
  const { Contacts } = await import("@capacitor-community/contacts");
  const result = await Contacts.pickContact({
    projection: { name: true, phones: true },
  });
  const contact = result?.contact;
  if (!contact) return null;

  const name = contact.name?.display?.trim() || "";
  for (const p of contact.phones ?? []) {
    const phone = normalisePhone(p.number ?? "");
    if (phone.length === 10) return { name, phone };
  }
  return { name, phone: "" };
}

/** Why reading the full address book failed. */
export type ContactsErrorReason = "permission-denied" | "unavailable";

export class ContactsError extends Error {
  reason: ContactsErrorReason;
  constructor(reason: ContactsErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "ContactsError";
    this.reason = reason;
  }
}

export const contactsErrorReason = (err: unknown): ContactsErrorReason =>
  err instanceof ContactsError ? err.reason : "unavailable";

/** Requests contacts permission on the device. Throws ContactsError if denied. */
export async function ensureContactsPermission(): Promise<void> {
  const { Contacts } = await import("@capacitor-community/contacts");
  let status: { contacts?: string };
  try {
    status = await Contacts.checkPermissions();
  } catch {
    // Permission not declared in the native manifest, or plugin missing
    throw new ContactsError("unavailable");
  }
  if (status.contacts === "granted") return;

  let requested: { contacts?: string };
  try {
    requested = await Contacts.requestPermissions();
  } catch {
    throw new ContactsError("unavailable");
  }
  if (requested.contacts !== "granted") {
    throw new ContactsError("permission-denied");
  }
}

/** Reads the device address book (native only). */
export async function loadDeviceContacts(): Promise<PickedContact[]> {
  if (!isNativeContacts()) throw new ContactsError("unavailable");

  const { Contacts } = await import("@capacitor-community/contacts");
  await ensureContactsPermission();

  let result: { contacts?: Array<{ name?: { display?: string }; phones?: Array<{ number?: string }> }> };
  try {
    result = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });
  } catch {
    throw new ContactsError("unavailable");
  }

  const list: PickedContact[] = [];
  for (const c of result.contacts ?? []) {
    const name = c.name?.display?.trim() || "";
    for (const p of c.phones ?? []) {
      const phone = normalisePhone(p.number ?? "");
      if (phone.length === 10) {
        list.push({ name, phone });
      }
    }
  }

  // De-duplicate by phone number
  const seen = new Set<string>();
  return list
    .filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
