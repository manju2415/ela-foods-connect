// Super-admin registration switch (platform_settings.registration_settings).
//
// Fails open: only an explicit `registration_enabled: false` turns registration
// off, so a missing row or a read error keeps today's registration flow.

// deno-lint-ignore-file no-explicit-any
type Client = any;

export async function isRegistrationEnabled(admin: Client): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "registration_settings")
      .maybeSingle();
    if (error) {
      console.error("[registrationSettings] read failed:", error);
      return true;
    }
    return (data?.value as { registration_enabled?: unknown } | null)?.registration_enabled !== false;
  } catch (e) {
    console.error("[registrationSettings] read failed:", e);
    return true;
  }
}
