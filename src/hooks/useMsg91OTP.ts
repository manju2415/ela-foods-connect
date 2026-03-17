import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMsg91OTP() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initDone, setInitDone] = useState(false);
  const [currentPhone, setCurrentPhone] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Check if MSG91 is configured by calling config endpoint
        const { data, error } = await supabase.functions.invoke('msg91-config');
        if (error || !data) {
          throw new Error(error?.message || 'Failed to fetch MSG91 config');
        }

        const { tokenAuth } = data as { widgetId: string; tokenAuth: string };

        // Detect placeholder/invalid tokens
        if (!tokenAuth || tokenAuth === 'MGSCLIENT123' || (!tokenAuth.startsWith('eyJ') && tokenAuth.split('.').length < 3)) {
          console.warn('[MSG91] Invalid or placeholder token, using mock OTP mode');
          if (mounted) {
            setInitError('Using mock OTP mode');
          }
          return;
        }

        if (mounted) {
          setIsReady(true);
          console.log('[MSG91] Backend API mode ready');
        }
      } catch (err: unknown) {
        console.error('[MSG91] Init error:', err);
        if (mounted) {
          setInitError(err instanceof Error ? err.message : 'MSG91 init failed');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          setInitDone(true);
        }
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

  const sendOtp = useCallback(async (phone: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
      setCurrentPhone(cleanPhone);

      console.log('[MSG91] Sending OTP via backend to', cleanPhone);
      const { data, error } = await supabase.functions.invoke('msg91-send-otp', {
        body: { phone: cleanPhone },
      });

      if (error) {
        console.error('[MSG91] Send OTP edge function error:', error);
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
  }, []);

  const verifyOtp = useCallback(async (otp: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[MSG91] Verifying OTP via backend...');
      const { data, error } = await supabase.functions.invoke('msg91-verify-otp', {
        body: { phone: currentPhone, otp },
      });

      if (error) {
        console.error('[MSG91] Verify OTP edge function error:', error);
        return { success: false, error: error.message || 'OTP verification failed' };
      }

      if (data?.success) {
        return { success: true };
      }

      return { success: false, error: data?.error || 'Invalid OTP' };
    } catch (err: unknown) {
      console.error('[MSG91] Verify OTP error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'OTP verification failed' };
    }
  }, [currentPhone]);

  const retryOtp = useCallback(async (_type: 'text' | 'voice' = 'text'): Promise<{ success: boolean; error?: string }> => {
    if (!currentPhone) {
      return { success: false, error: 'No phone number set' };
    }
    // Resend by calling send again
    return sendOtp(currentPhone);
  }, [currentPhone, sendOtp]);

  return { sendOtp, verifyOtp, retryOtp, isReady, isLoading, initError, initDone };
}
