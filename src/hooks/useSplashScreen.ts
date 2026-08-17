import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

type AppTheme = 'customer' | 'driver' | 'member';

const themeColors: Record<AppTheme, string> = {
  customer: '#f97316',
  driver: '#16a34a', 
  member: '#7c3aed',
};

export const useSplashScreen = (theme: AppTheme = 'customer') => {
  useEffect(() => {
    const initializeSplash = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        // Configure status bar for native feel
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: themeColors[theme] });
      } catch (error) {
        console.log('StatusBar not available:', error);
      }
    };

    initializeSplash();
  }, [theme]);

  const hideSplash = async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await SplashScreen.hide({
        fadeOutDuration: 500,
      });
    } catch (error) {
      console.log('SplashScreen hide error:', error);
    }
  };

  const showSplash = async () => {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await SplashScreen.show({
        autoHide: false,
        fadeInDuration: 300,
        fadeOutDuration: 500,
        showDuration: 2000,
      });
    } catch (error) {
      console.log('SplashScreen show error:', error);
    }
  };

  return { hideSplash, showSplash };
};
