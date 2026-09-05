import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

// push_token / push_token_updated_at exist on the live `profiles` table but
// aren't in the generated types yet — extend the real Update type rather
// than disabling type-checking on the whole call.
type ProfileUpdateWithPushToken = Database['public']['Tables']['profiles']['Update'] & {
  push_token?: string | null;
  push_token_updated_at?: string | null;
};

// FCM Server Key should be stored in Supabase secrets as FCM_SERVER_KEY
// This is used by edge functions to send push notifications

interface FCMNotificationPayload {
  to: string; // FCM token
  notification: {
    title: string;
    body: string;
    icon?: string;
  };
  data?: Record<string, string>;
}

export function useFCMPushNotifications() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotificationSchema[]>([]);
  const [isSupported, setIsSupported] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  useEffect(() => {
    // Check if running on native platform
    const platform = Capacitor.getPlatform();
    const native = platform === 'ios' || platform === 'android';
    // Extra guard: plugin might not be available in some builds
    const pluginAvailable = typeof Capacitor.isPluginAvailable === 'function'
      ? Capacitor.isPluginAvailable('PushNotifications')
      : true;

    setIsSupported(native && pluginAvailable);
  }, []);

  useEffect(() => {
    if (!isSupported || !user) return;

    // Register listeners first, but keep everything guarded so native plugin issues don't crash the app.
    const listenerPromises: Array<Promise<{ remove: () => void }>> = [];

    try {
      // Registration success - token received
      listenerPromises.push(
        PushNotifications.addListener('registration', async (tokenData: Token) => {
          console.log('[push] registration token received');
          setToken(tokenData.value);

          // Store token in database for later use
          if (user) {
            try {
              await supabase
                .from('profiles')
                .update({
                  push_token: tokenData.value,
                  push_token_updated_at: new Date().toISOString(),
                } as ProfileUpdateWithPushToken)
                .eq('id', user.id);

              console.log('[push] token saved');
            } catch (error) {
              console.error('[push] error saving token:', error);
            }
          }
        })
      );

      // Registration error
      listenerPromises.push(
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[push] registration error:', error);
        })
      );

      // Notification received while app is open
      listenerPromises.push(
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
          console.log('[push] notification received');
          setNotifications((prev) => [...prev, notification]);
        })
      );

      // Notification tapped
      listenerPromises.push(
        PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
          console.log('[push] notification action performed');

          const data = action.notification.data;
          if (data?.type === 'new_delivery') {
            window.location.href = '/driver-app';
          } else if (data?.type === 'order_update') {
            window.location.href = '/customer-app/orders';
          } else if (data?.type === 'referral_bonus') {
            window.location.href = '/member-app/wallet';
          } else if (data?.orderId) {
            window.location.href = `/dashboard`;
          }
        })
      );
    } catch (error) {
      // Some native failures can throw synchronously here.
      console.error('[push] listener setup failed:', error);
    }

    const checkPermissionsAndMaybeRegister = async () => {
      try {
        const permStatus = await PushNotifications.checkPermissions();
        setPermissionStatus(permStatus.receive);
        // IMPORTANT: Do NOT request permission or register automatically here,
        // even if already granted. `.register()` calls into the native
        // FirebaseMessaging SDK, which throws if the app was built without a
        // valid android/app/google-services.json (no Firebase project wired
        // up) — a native-side exception that crashes the whole app and can't
        // be caught from JS. Only register in response to an explicit user
        // tap (see requestPermission below), never on page mount.
      } catch (error) {
        console.error('[push] checkPermissions failed:', error);
      }
    };

    checkPermissionsAndMaybeRegister();

    return () => {
      listenerPromises.forEach((p) => {
        p.then((l) => l.remove()).catch(() => undefined);
      });
    };
  }, [isSupported, user]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  const requestPermission = async () => {
    if (!isSupported) return false;
    
    try {
      const permStatus = await PushNotifications.requestPermissions();
      setPermissionStatus(permStatus.receive);
      
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  };

  return {
    token,
    notifications,
    isSupported,
    permissionStatus,
    requestPermission,
    clearNotifications,
  };
}

// Helper to get notification type based on context
export function getNotificationType(context: 'driver' | 'customer' | 'member'): string[] {
  switch (context) {
    case 'driver':
      return ['new_delivery', 'order_cancelled', 'delivery_reminder'];
    case 'customer':
      return ['order_update', 'order_shipped', 'order_delivered', 'promo'];
    case 'member':
      return ['referral_bonus', 'commission_earned', 'withdrawal_processed'];
    default:
      return [];
  }
}
