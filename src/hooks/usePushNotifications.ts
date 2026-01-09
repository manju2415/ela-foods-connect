import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePushNotifications() {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotificationSchema[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if running on native platform
    const platform = Capacitor.getPlatform();
    setIsSupported(platform === 'ios' || platform === 'android');
  }, []);

  useEffect(() => {
    if (!isSupported || !user) return;

    const setupPushNotifications = async () => {
      try {
        // Request permission
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission not granted');
          return;
        }

        // Register with push notification service
        await PushNotifications.register();
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    // Set up listeners
    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value);
      setToken(token.value);
      
      // Store token in database for later use
      if (user) {
        try {
          await supabase
            .from('profiles')
            .update({ push_token: token.value } as any)
            .eq('id', user.id);
        } catch (error) {
          console.error('Error saving push token:', error);
        }
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received:', notification);
      setNotifications(prev => [...prev, notification]);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('Push notification action performed:', action);
      // Handle notification tap - navigate to relevant screen
      const data = action.notification.data;
      if (data?.type === 'new_delivery') {
        window.location.href = '/delivery';
      } else if (data?.type === 'order_update') {
        window.location.href = '/dashboard';
      }
    });

    setupPushNotifications();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [isSupported, user]);

  const clearNotifications = () => {
    setNotifications([]);
  };

  return {
    token,
    notifications,
    isSupported,
    clearNotifications,
  };
}
