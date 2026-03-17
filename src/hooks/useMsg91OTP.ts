import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMsg91OTP() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [currentPhone, setCurrentPhone] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('msg91-config');
        if (error || !data) {
          throw new Error(error?.message || 'MSG91 is not configured. Please contact support.');
        }

        const { tokenAuth } = data as { widgetId: string; tokenAuth: string };
        if (!tokenAuth) {
          throw new Error('MSG91 authentication token is missing. OTP service unavailable.');
        }

        if (mounted) {
          setIsReady(true);
          console.log('[MSG91] Backend API ready');
        }
      } catch (err: unknown) {
        console.error('[MSG91] Init error:', err);
        if (mounted) {
          setInitError(err instanceof Error ? err.message : 'MSG91 initialization failed');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  const sendOtp = useCallback(async (phone: string): Promise<{ success: boolean; error?: string }> => {
    if (!isReady) {
      return { success: false, error: initError || 'OTP service is not available. Please try again later.' };
    }

    try {
      const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
      setCurrentPhone(cleanPhone);

      console.log('[MSG91] Sending OTP via backend to', cleanPhone);
      const { data, error } = await supabase.functions.invoke('msg91-send-otp', {
        body: { phone: cleanPhone },
      });

      if (error) {
        console.error('[MSG91] Send OTP error:', error);
        return { success: false, error: error.message || 'Failed to send OTP' };
      }

      if (data?.success) {
        return { success: true };
      }

      return { success: false, error: data?.error || 'Failed to send OTP' };
    } catch (err: unknown) {
      console.error('[MSG91] Send OTP error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to send OTP' };
    }
  }, [isReady, initError]);

  const verifyOtp = useCallback(async (otp: string): Promise<{ success: boolean; error?: string }> => {
    if (!isReady) {
      return { success: false, error: 'OTP service is not available.' };
    }

    if (!currentPhone) {
      return { success: false, error: 'No phone number found. Please request OTP again.' };
    }

    try {
      console.log('[MSG91] Verifying OTP via backend...');
      const { data, error } = await supabase.functions.invoke('msg91-verify-otp', {
        body: { phone: currentPhone, otp },
      });

      if (error) {
        console.error('[MSG91] Verify OTP error:', error);
        return { success: false, error: error.message || 'OTP verification failed' };
      }

      if (data?.success) {
        return { success: true };
      }

      return { success: false, error: data?.error || 'Invalid OTP. Please try again.' };
    } catch (err: unknown) {
      console.error('[MSG91] Verify OTP error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'OTP verification failed' };
    }
  }, [isReady, currentPhone]);

  const retryOtp = useCallback(async (_type: 'text' | 'voice' = 'text'): Promise<{ success: boolean; error?: string }> => {
    if (!currentPhone) {
      return { success: false, error: 'No phone number set. Please go back and enter your number.' };
    }
    return sendOtp(currentPhone);
  }, [currentPhone, sendOtp]);

  return { sendOtp, verifyOtp, retryOtp, isReady, isLoading, initError };
}
