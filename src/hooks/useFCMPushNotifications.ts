import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
    setIsSupported(platform === 'ios' || platform === 'android');
  }, []);

  useEffect(() => {
    if (!isSupported || !user) return;

    const setupPushNotifications = async () => {
      try {
        // Check permissions
        let permStatus = await PushNotifications.checkPermissions();
        setPermissionStatus(permStatus.receive);
        
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
          setPermissionStatus(permStatus.receive);
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Register with FCM
        await PushNotifications.register();
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    // Registration success - token received
    const registrationListener = PushNotifications.addListener('registration', async (tokenData: Token) => {
      console.log('FCM Registration success, token:', tokenData.value);
      setToken(tokenData.value);
      
      // Store token in database for later use
      if (user) {
        try {
          // Store the FCM token in profiles table
          await supabase
            .from('profiles')
            .update({ 
              push_token: tokenData.value,
              push_token_updated_at: new Date().toISOString()
            } as any)
            .eq('id', user.id);
          
          console.log('FCM token saved to database');
        } catch (error) {
          console.error('Error saving FCM token:', error);
        }
      }
    });

    // Registration error
    const registrationErrorListener = PushNotifications.addListener('registrationError', (error) => {
      console.error('FCM Registration error:', error);
    });

    // Notification received while app is open
    const notificationReceivedListener = PushNotifications.addListener(
      'pushNotificationReceived', 
      (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
        setNotifications(prev => [...prev, notification]);
      }
    );

    // Notification tapped
    const notificationActionListener = PushNotifications.addListener(
      'pushNotificationActionPerformed', 
      (action: ActionPerformed) => {
        console.log('Push notification action performed:', action);
        
        // Handle notification tap - navigate based on type
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
      }
    );

    setupPushNotifications();

    return () => {
      registrationListener.then(l => l.remove());
      registrationErrorListener.then(l => l.remove());
      notificationReceivedListener.then(l => l.remove());
      notificationActionListener.then(l => l.remove());
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
