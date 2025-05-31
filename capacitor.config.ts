import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'TrackExpress',
  webDir: 'www',
  plugins: {
    Geolocation: {
      requestPermissions: true
    },
    Camera: {
      requestPermissions: true
    },
    SplashScreen: {
      launchShowDuration: 1300,
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_CENTER",
      autoHide: true 
    },
    StatusBar: {
      androidOverlaysWebView: false,
      style: "DARK",
      backgroundColor: "#FFD700" // Keep yellow for status bar only
    }
  },
  android: {
    captureInput: false,
    webContentsDebuggingEnabled: true
  }
};

export default config;
