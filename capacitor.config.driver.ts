import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.aab01a9c384445a1bae56f4a0a52a33f.driver',
  appName: 'ELA Delivery',
  webDir: 'dist',
  server: {
    url: 'https://aab01a9c-3844-45a1-bae5-6f4a0a52a33f.lovableproject.com/driver-app?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#16a34a',
      showSpinner: false,
    },
  },
};

export default config;
