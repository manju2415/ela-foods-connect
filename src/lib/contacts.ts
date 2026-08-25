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

/** Requests contacts permission on the device. Throws if denied. */
export async function ensureContactsPermission(): Promise<void> {
  const { Contacts } = await import("@capacitor-community/contacts");
  const status = await Contacts.checkPermissions();
  if (status.contacts === "granted") return;
  const requested = await Contacts.requestPermissions();
  if (requested.contacts !== "granted") {
    throw new Error("permission-denied");
  }
}

/** Reads the device address book (native only). */
export async function loadDeviceContacts(): Promise<PickedContact[]> {
  const { Contacts } = await import("@capacitor-community/contacts");
  await ensureContactsPermission();

  const result = await Contacts.getContacts({
    projection: { name: true, phones: true },
  });

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
