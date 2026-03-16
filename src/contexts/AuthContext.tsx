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

  const sendOtp = async (_phone: string) => {
    // TODO: Replace with real SMS gateway (e.g. Twilio) later
    // For now, mock OTP send — always succeeds
    console.log("[Auth] Mock OTP sent to", _phone);
    return { error: null as Error | null };
  };

  const verifyOtp = async (phone: string, _token: string) => {
    // Mock OTP: use email-based auth behind the scenes since phone provider needs Twilio
    // Generate a deterministic email from the phone number
    const cleanPhone = phone.replace(/\+/g, '');
    const mockEmail = `${cleanPhone}@elabazar.local`;
    const tempPassword = `elabazar_${cleanPhone}_temp_2026`;

    // Try to sign up first (will fail silently if user exists)
    const { error: signUpError } = await supabase.auth.signUp({
      email: mockEmail,
      password: tempPassword,
      options: {
        data: {
          full_name: pendingSignupRef.current?.fullName || '',
          phone: phone,
        }
      }
    });

    // If signup failed for reason other than "user already exists", that's ok - we'll try sign in
    if (signUpError && !signUpError.message.includes('already registered')) {
      console.log("[Auth] Signup attempt:", signUpError.message);
    }

    // Small delay to let trigger fire for new users
    await new Promise(r => setTimeout(r, 500));

    // Now sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: mockEmail,
      password: tempPassword,
    });

    if (error) {
      return { error: error as Error };
    }

    // If there was pending signup data, process MLM referral and update profile
    const pending = pendingSignupRef.current;
    if (pending && data.user) {
      await supabase
        .from("profiles")
        .update({ full_name: pending.fullName, phone: phone })
        .eq("id", data.user.id);

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

    // Update phone on profile if not set
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ phone: phone })
        .eq("id", data.user.id);
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

    // Mock OTP send — real SMS gateway to be added later
    console.log("[Auth] Mock OTP sent for signup to", phone);
    const error = null;

    if (error) {
      pendingSignupRef.current = null;
    }

    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // Session may already be expired/invalid — clear local state anyway
    }
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, sendOtp, verifyOtp, signUpWithOtp, signOut, suppressAuthChanges }}>
      {children}
    </AuthContext.Provider>
  );
};
