import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Create a Supabase session for a phone-verified user (call AFTER MSG91 OTP is verified) */
  createSessionForPhone: (phone: string, signupData?: { fullName: string; referralCode: string }) => Promise<{ error: Error | null; isNewUser?: boolean }>;
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
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * After MSG91 OTP verification succeeds, create a Supabase session for the user.
   * Uses deterministic email/password based on phone number.
   * Optionally processes MLM signup if signupData is provided.
   */
  const createSessionForPhone = async (
    phone: string,
    signupData?: { fullName: string; referralCode: string }
  ): Promise<{ error: Error | null; isNewUser?: boolean }> => {
    const cleanPhone = phone.replace(/\+/g, '');
    const mockEmail = `${cleanPhone}@elabazar.local`;
    const tempPassword = `elabazar_${cleanPhone}_temp_2026`;

    // Try to sign up first (will fail silently if user exists)
    const { error: signUpError } = await supabase.auth.signUp({
      email: mockEmail,
      password: tempPassword,
      options: {
        data: {
          full_name: signupData?.fullName || '',
          phone: phone,
        }
      }
    });

    if (signUpError && !signUpError.message.includes('already registered')) {
      console.log("[Auth] Signup attempt:", signUpError.message);
    }

    // Small delay to let handle_new_user trigger fire for new users
    await new Promise(r => setTimeout(r, 500));

    // Sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email: mockEmail,
      password: tempPassword,
    });

    if (error) {
      return { error: error as Error };
    }

    // If signup data provided, process MLM referral and update profile
    if (signupData && data.user) {
      await supabase
        .from("profiles")
        .update({ full_name: signupData.fullName, phone: phone })
        .eq("id", data.user.id);

      try {
        await supabase.rpc("process_mlm_referral", {
          p_referral_code: signupData.referralCode.toUpperCase(),
          p_referred_user_id: data.user.id,
          p_registration_fee: 0,
        });
      } catch (err) {
        console.error("Error processing MLM referral:", err);
      }

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
    <AuthContext.Provider value={{ user, session, loading, createSessionForPhone, signOut, suppressAuthChanges }}>
      {children}
    </AuthContext.Provider>
  );
};
