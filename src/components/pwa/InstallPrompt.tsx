import { useState, useEffect } from "react";
import { X, Download, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

interface InstallPromptProps {
  appName: string;
  appType: "customer" | "driver" | "member";
  themeColor: string;
}

export function InstallPrompt({ appName, appType, themeColor }: InstallPromptProps) {
  const { isInstallable, isInstalled, isIOS, installApp, dismissPrompt, shouldShowPrompt } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Delay showing the prompt for better UX
    const timer = setTimeout(() => {
      if (shouldShowPrompt()) {
        setShowPrompt(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [shouldShowPrompt]);

  if (isInstalled || !showPrompt) return null;

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
    } else {
      const success = await installApp();
      if (success) {
        setShowPrompt(false);
      }
    }
  };

  const handleDismiss = () => {
    dismissPrompt();
    setShowPrompt(false);
    setShowIOSInstructions(false);
  };

  const getIcon = () => {
    switch (appType) {
      case "customer":
        return "🍽️";
      case "driver":
        return "🚚";
      case "member":
        return "🌐";
    }
  };

  if (showIOSInstructions) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-card border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: themeColor }}
              >
                {getIcon()}
              </div>
              <div>
                <h3 className="font-semibold text-lg">Install {appName}</h3>
                <p className="text-sm text-muted-foreground">Add to Home Screen</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleDismiss}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Share className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Step 1</p>
                <p className="text-sm text-muted-foreground">Tap the Share button at the bottom of Safari</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Step 2</p>
                <p className="text-sm text-muted-foreground">Scroll down and tap "Add to Home Screen"</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Step 3</p>
                <p className="text-sm text-muted-foreground">Tap "Add" to install the app</p>
              </div>
            </div>
          </div>
          
          <Button 
            className="w-full mt-6" 
            variant="outline" 
            onClick={handleDismiss}
          >
            Got it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 animate-in slide-in-from-bottom duration-300">
      <div className="bg-card border rounded-xl shadow-lg p-4 flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: themeColor }}
        >
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">Install {appName}</p>
          <p className="text-sm text-muted-foreground">Add to your home screen</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={handleDismiss}>
            <X className="h-5 w-5" />
          </Button>
          <Button 
            size="sm" 
            onClick={handleInstall}
            style={{ backgroundColor: themeColor }}
            className="text-white hover:opacity-90"
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
