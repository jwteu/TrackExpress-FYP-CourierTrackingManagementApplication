import { Injectable, inject } from '@angular/core';
import { AlertController, Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

@Injectable({
  providedIn: 'root'
})
export class LocationEnablerService {
  private alertCtrl = inject(AlertController);
  private platform = inject(Platform);
  
  private isEnablingLocation = false;
  private hasVerifiedHighAccuracy = false;

  constructor() {}

  /**
   * Ensures location services are enabled with proper accuracy
   * @returns Promise resolving to boolean indicating if location is enabled
   */
  async ensureLocationEnabled(): Promise<boolean> {
    try {
      // For Android platform
      if (Capacitor.getPlatform() === 'android') {
        // NEW: If we've already verified high accuracy in this session, don't check again
        if (this.hasVerifiedHighAccuracy) {
          console.log('High accuracy location already verified in this session');
          return true;
        }
        
        // If we're already trying to enable location, avoid showing multiple dialogs
        if (this.isEnablingLocation) {
          console.log('Location enabling already in progress, waiting...');
          // Wait a bit and return true to avoid multiple dialogs
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        }

        try {
          // First check if high-accuracy location is already enabled
          const isHighAccuracy = await this.checkHighAccuracyEnabled();
          if (isHighAccuracy) {
            console.log('High accuracy location already enabled');
            this.hasVerifiedHighAccuracy = true; // Set flag so we don't check again
            return true;
          }
          
          // If not in high accuracy mode, show dialog to enable it
          console.log('Location not in high accuracy mode, showing dialog');
          return this.showEnableLocationDialog();
        } catch (error) {
          console.log('Error checking location status:', error);
          return this.showEnableLocationDialog();
        }
      } 
      // For web or iOS, we'll use Capacitor Geolocation
      else {
        // Try to get permission - this will prompt the user if needed
        try {
          await Geolocation.getCurrentPosition({timeout: 5000});
          return true;
        } catch (error) {
          return this.showEnableLocationDialog();
        }
      }
    } catch (error) {
      console.error('Location enablement error:', error);
      return false;
    }
  }

  /**
   * Check if high-accuracy location mode is enabled
   * More reliable check that avoids false negatives
   */
  private async checkHighAccuracyEnabled(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return true; // Not applicable for non-Android platforms
    }

    try {
      // IMPROVED: Try a quick position check first - if it works, location is enabled
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 8000 // Increased timeout for more reliability
        });
        
        console.log('Successfully got high accuracy position:', position);
        // If we get a position with good accuracy, high accuracy mode is likely enabled
        if (position && position.coords && position.coords.accuracy < 100) {
          console.log('Position accuracy good:', position.coords.accuracy);
          return true;
        }
        
        // Even if accuracy isn't great, we still got a position
        console.log('Position obtained but accuracy not ideal:', position.coords.accuracy);
        return true;
      } catch (error) {
        console.log('Location services check failed:', error);
        return false;
      }
    } catch (error) {
      console.log('Location services check failed:', error);
      return false;
    }
  }

  /**
   * Shows a dialog prompting user to enable location settings
   */
  private async showEnableLocationDialog(): Promise<boolean> {
    this.isEnablingLocation = true;
    
    return new Promise<boolean>(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header: 'Location Required',
        message: 'This app requires location services. Please enable location in your device settings.',
        backdropDismiss: false,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => {
              this.isEnablingLocation = false;
              resolve(false);
            }
          },
          {
            text: 'OK',
            handler: () => {
              this.isEnablingLocation = false;
              resolve(true);
            }
          }
        ]
      });

      await alert.present();
    });
  }

  /**
   * Request high accuracy location mode
   */
  async requestHighAccuracyLocation(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return true; // Not needed for other platforms
    }

    // NEW: If we already verified high accuracy, don't request again
    if (this.hasVerifiedHighAccuracy) {
      return true;
    }

    try {
      // Use a simple approach without the LocationAccuracy plugin
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000
      });
      this.hasVerifiedHighAccuracy = true;
      return true;
    } catch (error) {
      console.error('Failed to request high accuracy location:', error);
      return false;
    }
  }
}