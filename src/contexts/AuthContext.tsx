import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { toast } from "sonner";

// Standard "remember me, but not forever" session policy: sign the user out
// if the app hasn't been opened in this long, rather than immediately on
// every close. Checked on launch/resume — no background timer needed.
const INACTIVITY_LOGOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LAST_ACTIVE_STORAGE_KEY = "ela_last_active_at";

const markActive = () => {
  try { localStorage.setItem(LAST_ACTIVE_STORAGE_KEY, String(Date.now())); } catch {
    // Storage may be unavailable in private browsing or restricted webviews.
  }
};

const isInactiveTooLong = (): boolean => {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_STORAGE_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) > INACTIVITY_LOGOUT_MS;
  } catch {
    return false;
  }
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Create a Supabase session for a phone, re-verifying the OTP server-side atomically with session creation. */
  createSessionForPhone: (phone: string, otp: string, signupData?: { fullName: string; referralCode: string }) => Promise<{ error: Error | null; isNewUser?: boolean }>;
  signOut: () => Promise<void>;
  suppressAuthChanges: (suppress: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const suppressRef = useRef(false);

  const suppressAuthChanges = useCallback((suppress: boolean) => {
    suppressRef.current = suppress;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (suppressRef.current) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        if (newSession) markActive();
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && isInactiveTooLong()) {
        // Hasn't opened the app in over a week — sign out rather than resume
        // a stale session. onAuthStateChange (above) picks up SIGNED_OUT and
        // clears user/session for us.
        await supabase.auth.signOut().catch(() => {});
        toast.info("You were signed out after a period of inactivity. Please log in again.");
        setLoading(false);
        return;
      }
      if (session) markActive();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-check on resume (native) / tab refocus (web) too — a phone can stay
  // backgrounded-but-not-killed for a long time without a fresh app launch.
  useEffect(() => {
    const checkAndMark = async () => {
      if (!(await supabase.auth.getSession()).data.session) return;
      if (isInactiveTooLong()) {
        await supabase.auth.signOut().catch(() => {});
        toast.info("You were signed out after a period of inactivity. Please log in again.");
      } else {
        markActive();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkAndMark();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    let removeResumeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener("resume", checkAndMark).then((handle) => {
        removeResumeListener = () => handle.remove();
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      removeResumeListener?.();
    };
  }, []);

  /**
   * Verifies the OTP server-side and mints a session for the phone's account in one
   * atomic call — the client never computes or knows the account's Supabase Auth
   * password, so a session can only be obtained by actually passing OTP verification.
   * Existing users sign in directly; walk-ins are created server-side first.
   * No client-side signUp — all onboarding goes through server-side admin.createUser flows.
   * Supplying `signupData` activates the open-registration flow.
   */
  const createSessionForPhone = async (
    phone: string,
    otp: string,
    signupData?: { fullName: string; referralCode: string }
  ): Promise<{ error: Error | null; isNewUser?: boolean }> => {
    let isNewUser = false;
    if (signupData) {
      const { data: created, error: createError } = await supabase.functions.invoke("signup-create-user", {
        body: {
          phone,
          fullName: signupData.fullName,
          referralCode: signupData.referralCode,
          founder: false,
        },
      });
      if (createError || !created?.success) {
        return { error: new Error(created?.error || createError?.message || "Could not create account.") };
      }
      isNewUser = created.isNewUser === true;
    }

    const { data, error } = await supabase.functions.invoke("verify-otp-login", {
      body: { phone, otp, platform: Capacitor.getPlatform() },
    });

    if (error || !data?.success || !data?.access_token || !data?.refresh_token) {
      const ctx = (error as { context?: { text?: () => Promise<string> } } | undefined)?.context;
      let body: { error?: string } | null = null;
      try { body = ctx && typeof ctx.text === "function" ? JSON.parse(await ctx.text()) : null; } catch { /* body wasn't valid JSON — fall back to the generic error message below */ }
      // Prefer whatever the server actually said; the old catch-all text is only
      // used when no server message came back at all (e.g. a network failure).
      const serverMessage = body?.error || data?.error || error?.message;
      return { error: new Error(serverMessage || "Could not sign in. Please check your connection and try again.") };
    }

    const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    if (setSessionError) {
      return { error: new Error("Could not sign in. Please try again.") };
    }

    if (sessionData.user) {
      await supabase
        .from("profiles")
        .update({ phone })
        .eq("id", sessionData.user.id);
    }

    return { error: null, isNewUser };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // Session may already be expired/invalid — clear local state anyway
    }
    setUser(null);
    setSession(null);
    try { localStorage.removeItem(LAST_ACTIVE_STORAGE_KEY); } catch {
      // Local state is already cleared; unavailable storage needs no action.
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, createSessionForPhone, signOut, suppressAuthChanges }}>
      {children}
    </AuthContext.Provider>
  );
};
