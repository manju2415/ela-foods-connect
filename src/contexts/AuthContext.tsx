import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  sendOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null; isNewUser?: boolean }>;
  signUpWithOtp: (phone: string, fullName: string, referralCode: string) => Promise<{ error: Error | null }>;
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
  // Store signup metadata temporarily between sendOtp and verifyOtp
  const pendingSignupRef = useRef<{ fullName: string; referralCode: string } | null>(null);

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
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendOtp = async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return { error: error as Error | null };
  };

  const verifyOtp = async (phone: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      return { error: error as Error };
    }

    // If there was pending signup data, process MLM referral
    const pending = pendingSignupRef.current;
    if (pending && data.user) {
      // Update profile with full name
      await supabase
        .from("profiles")
        .update({ full_name: pending.fullName })
        .eq("id", data.user.id);

      // Process MLM referral
      try {
        await supabase.rpc("process_mlm_referral", {
          p_referral_code: pending.referralCode.toUpperCase(),
          p_referred_user_id: data.user.id,
          p_registration_fee: 0,
        });
      } catch (err) {
        console.error("Error processing MLM referral:", err);
      }

      pendingSignupRef.current = null;
      return { error: null, isNewUser: true };
    }

    return { error: null, isNewUser: false };
  };

  const signUpWithOtp = async (phone: string, fullName: string, referralCode: string) => {
    // Validate the referral code first
    const { data: codeData, error: codeError } = await supabase
      .from("referral_codes")
      .select("id, user_id, is_active")
      .eq("code", referralCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (codeError) {
      return { error: new Error("Error validating referral code") };
    }

    if (!codeData) {
      return { error: new Error("Invalid or inactive referral code") };
    }

    // Store signup metadata for after OTP verification
    pendingSignupRef.current = { fullName, referralCode };

    // Send OTP (signInWithOtp auto-creates user if not exists)
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        data: {
          full_name: fullName,
          referral_code: referralCode.toUpperCase(),
        },
      },
    });

    if (error) {
      pendingSignupRef.current = null;
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, sendOtp, verifyOtp, signUpWithOtp, signOut, suppressAuthChanges }}>
      {children}
    </AuthContext.Provider>
  );
};
