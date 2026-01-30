import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.aab01a9c384445a1bae56f4a0a52a33f.driver',
  appName: 'ELA Delivery',
  webDir: 'dist',
  // For local development: replace YOUR_LOCAL_IP with your machine's IP (e.g., 192.168.1.100)
  // Find it with: ipconfig (Windows) or ifconfig (Mac/Linux)
  // Your phone must be on the same WiFi network
  server: {
    url: 'http://YOUR_LOCAL_IP:8080/driver-app',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: '#16a34a',
      showSpinner: true,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#16a34a',
    },
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'ELA Delivery',
  },
  android: {
    backgroundColor: '#16a34a',
  },
};

export default config;
