import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, options?: Record<string, unknown>) => Promise<unknown>;
    verifyOtp?: (otp: string) => Promise<unknown>;
    retryOtp?: (retryType: string) => Promise<unknown>;
  }
}

function loadScript(urls: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window.initSendOTP === 'function') {
      resolve();
      return;
    }

    let i = 0;
    function attempt() {
      const s = document.createElement('script');
      s.src = urls[i];
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        i++;
        if (i < urls.length) attempt();
        else reject(new Error('Failed to load MSG91 script'));
      };
      document.head.appendChild(s);
    }
    attempt();
  });
}

export function useMsg91OTP() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [initDone, setInitDone] = useState(false);

  // Promise resolvers for verify flow
  const successResolveRef = useRef<((data: unknown) => void) | null>(null);
  const failureRejectRef = useRef<((error: unknown) => void) | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Fetch widget config from edge function
        const { data, error } = await supabase.functions.invoke('msg91-config');
        if (error || !data) {
          throw new Error(error?.message || 'Failed to fetch MSG91 config');
        }

        const { widgetId, tokenAuth } = data as { widgetId: string; tokenAuth: string };

        // Load MSG91 OTP provider script
        await loadScript([
          'https://verify.msg91.com/otp-provider.js',
          'https://verify.phone91.com/otp-provider.js',
        ]);

        if (!mounted) return;

        if (typeof window.initSendOTP !== 'function') {
          throw new Error('MSG91 script loaded but initSendOTP not found');
        }

        // Initialize widget with exposeMethods so we control the UI
        const configuration = {
          widgetId,
          tokenAuth,
          exposeMethods: true,
          success: (responseData: unknown) => {
            console.log('[MSG91] OTP verified successfully', responseData);
            if (successResolveRef.current) {
              successResolveRef.current(responseData);
              successResolveRef.current = null;
              failureRejectRef.current = null;
            }
          },
          failure: (errorData: unknown) => {
            console.error('[MSG91] OTP verification failed', errorData);
            if (failureRejectRef.current) {
              failureRejectRef.current(errorData);
              failureRejectRef.current = null;
              successResolveRef.current = null;
            }
          },
        };

        window.initSendOTP(configuration);
        setIsReady(true);
        console.log('[MSG91] Widget initialized successfully');
      } catch (err: unknown) {
        console.error('[MSG91] Initialization error:', err);
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
    if (!window.sendOtp) {
      return { success: false, error: 'MSG91 not ready' };
    }
    try {
      // MSG91 expects phone with country code (e.g., 919876543210)
      const identifier = phone.startsWith('+') ? phone.slice(1) : phone.replace(/^\+/, '');
      console.log('[MSG91] Sending OTP to', identifier);
      await window.sendOtp(identifier);
      return { success: true };
    } catch (err: unknown) {
      console.error('[MSG91] Send OTP error:', err);
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to send OTP';
      return { success: false, error: message };
    }
  }, []);

  const verifyOtp = useCallback(async (otp: string): Promise<{ success: boolean; token?: unknown; error?: string }> => {
    if (!window.verifyOtp) {
      return { success: false, error: 'MSG91 not ready' };
    }
    try {
      console.log('[MSG91] Verifying OTP...');
      // Create a promise that resolves when success/failure callback fires
      const result = await new Promise<unknown>((resolve, reject) => {
        successResolveRef.current = resolve;
        failureRejectRef.current = reject;

        // Call MSG91 verify - the success/failure callbacks in config will fire
        window.verifyOtp!(otp).catch((err: unknown) => {
          // If verifyOtp itself rejects, handle it
          if (failureRejectRef.current) {
            failureRejectRef.current(err);
            failureRejectRef.current = null;
            successResolveRef.current = null;
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (failureRejectRef.current) {
            failureRejectRef.current(new Error('OTP verification timed out'));
            failureRejectRef.current = null;
            successResolveRef.current = null;
          }
        }, 30000);
      });

      return { success: true, token: result };
    } catch (err: unknown) {
      console.error('[MSG91] Verify OTP error:', err);
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'OTP verification failed';
      return { success: false, error: message };
    }
  }, []);

  const retryOtp = useCallback(async (type: 'text' | 'voice' = 'text'): Promise<{ success: boolean; error?: string }> => {
    if (!window.retryOtp) {
      return { success: false, error: 'MSG91 not ready' };
    }
    try {
      await window.retryOtp(type);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend OTP';
      return { success: false, error: message };
    }
  }, []);

  return { sendOtp, verifyOtp, retryOtp, isReady, isLoading, initError, initDone };
}
