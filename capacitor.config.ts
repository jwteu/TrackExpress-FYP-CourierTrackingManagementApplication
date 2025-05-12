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
      launchShowDuration: 1000,
      backgroundColor: "#222831",
      androidSplashResourceName: "splash",
      androidScaleType: "FIT_CENTER" // Changed from CENTER_CROP to FIT_CENTER
    },
    StatusBar: {
      androidOverlaysWebView: false, // Keep this false
      style: "DARK", // Dark text for better visibility on yellow
      backgroundColor: "#FFD700" // Yellow color
    }
  },
  android: {
    captureInput: false, // Temporarily test this
    webContentsDebuggingEnabled: true
  }
};

export default config;
