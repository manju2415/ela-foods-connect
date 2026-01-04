import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, referralCode: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, referralCode: string) => {
    // First validate the referral code
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

    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          referral_code: referralCode.toUpperCase(),
        },
      },
    });

    if (error) {
      return { error: error as Error };
    }

    // If signup successful and we have a user, process the referral incentive
    if (data.user) {
      // Use setTimeout to defer the Supabase call (avoiding deadlock in auth state change)
      setTimeout(async () => {
        try {
          await supabase.rpc("process_referral_incentive", {
            p_referral_code: referralCode.toUpperCase(),
            p_referred_user_id: data.user!.id,
          });
        } catch (err) {
          console.error("Error processing referral incentive:", err);
        }
      }, 100);
    }
    
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
