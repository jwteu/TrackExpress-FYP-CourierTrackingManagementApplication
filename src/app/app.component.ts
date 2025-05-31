import { Component, inject, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { LocationTrackingService } from './services/location-tracking.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Platform, AlertController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, RouterModule]
})
export class AppComponent implements OnInit {
  private locationTrackingService = inject(LocationTrackingService);
  private platform = inject(Platform);
  private alertController = inject(AlertController);
  private router = inject(Router);
  
  // Updated properties for better exit handling
  private isExitAlertOpen = false;
  private backButtonSubscription: any;

  constructor() {
    console.log('App initialized, location tracking service ready');
    
    // Initialize platform and plugins
    this.initializeApp();
    
    // Force the service to be created when the app starts
    this.locationTrackingService.toString();
  }
  
  ngOnInit() {
    this.setupBackButtonHandler();
  }
  
  async initializeApp() {
    await this.platform.ready();
    
    if (Capacitor.isNativePlatform()) {
      try {
        // CRITICAL: First set overlay to false - this prevents content from drawing under status bar
        await StatusBar.setOverlaysWebView({ overlay: false });
        
        // Set status bar to yellow color
        await StatusBar.setBackgroundColor({ color: '#FFD700' });
        
        // Make sure status bar text is BLACK since yellow is a light color
        await StatusBar.setStyle({ style: Style.Dark });
        
        // Make sure the status bar is visible
        await StatusBar.show();
        
        // Uncomment this to ensure the native splash screen hides properly
        await SplashScreen.hide({
          fadeOutDuration: 300
        });
      } catch (err) {
        console.error('Error initializing device UI:', err);
      }
    }
  }
  
  setupBackButtonHandler() {
    if (Capacitor.isNativePlatform()) {
      // Remove any existing listener first
      if (this.backButtonSubscription) {
        this.backButtonSubscription.remove();
      }
      
      // Add the back button listener
      this.backButtonSubscription = App.addListener('backButton', async (event) => {
        console.log('🔄 Back button pressed, current alert state:', this.isExitAlertOpen);
        
        // If an exit alert is already open, ignore this back button press
        if (this.isExitAlertOpen) {
          console.log('❌ Exit alert already open, ignoring back button press');
          return;
        }
        
        // Get current URL
        const currentUrl = this.router.url;
        console.log('📍 Current URL:', currentUrl);
        
        // Show exit alert on landing page
        if (currentUrl === '/landing') {
          console.log('🏠 On landing page - showing exit alert');
          this.showExitAlert();
        }
        // Show logout alert on admin home or deliveryman home
        else if (currentUrl === '/admin-home' || currentUrl === '/deliveryman-home') {
          console.log('🏢 On home page - showing logout alert');
          this.showLogoutAlert();
        }
        else {
          // For ALL other pages, just use normal back navigation
          console.log('⬅️ Normal back navigation for:', currentUrl);
          console.log('🔧 Using window.history.back()');
          window.history.back();
        }
      });
    }
  }
  
  // Clean up on destroy
  ngOnDestroy() {
    if (this.backButtonSubscription) {
      this.backButtonSubscription.remove();
    }
  }

  // Add this new method for exit alert
  private async showExitAlert() {
    // Set the flag immediately to prevent multiple alerts
    this.isExitAlertOpen = true;
    
    try {
      console.log('Showing exit confirmation dialog from landing page');
      
      // Show exit confirmation dialog
      const alert = await this.alertController.create({
        header: 'Confirm Exit',
        message: 'Are you sure you want to exit the app?',
        backdropDismiss: false,
        keyboardClose: false,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            cssClass: 'alert-button-cancel',
            handler: () => {
              console.log('Exit cancelled by user');
              this.isExitAlertOpen = false;
              return true;
            }
          },
          {
            text: 'Exit',
            cssClass: 'alert-button-confirm',
            handler: () => {
              console.log('User confirmed exit');
              this.isExitAlertOpen = false;
              setTimeout(() => {
                App.exitApp();
              }, 100);
              return true;
            }
          }
        ]
      });
      
      // Handle alert dismissal
      alert.onDidDismiss().then((result) => {
        console.log('Alert dismissed:', result);
        this.isExitAlertOpen = false;
      });
      
      // Present the alert
      await alert.present();
      console.log('Exit alert presented successfully');
      
    } catch (error) {
      console.error('Error showing exit alert:', error);
      this.isExitAlertOpen = false;
    }
  }

  // Add this new method for logout alert
  private async showLogoutAlert() {
    // Set the flag immediately to prevent multiple alerts
    this.isExitAlertOpen = true;
    
    try {
      console.log('Showing logout confirmation dialog from home page');
      
      // Show logout confirmation dialog
      const alert = await this.alertController.create({
        header: 'Logout Confirmation',
        message: 'Do you want to logout from the app?',
        backdropDismiss: false,
        keyboardClose: false,
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
            cssClass: 'alert-button-cancel',
            handler: () => {
              console.log('Logout cancelled by user');
              this.isExitAlertOpen = false;
              return true;
            }
          },
          {
            text: 'Logout',
            cssClass: 'alert-button-confirm',
            handler: () => {
              console.log('User confirmed logout');
              this.isExitAlertOpen = false;
              this.performLogout();
              return true;
            }
          }
        ]
      });
      
      // Handle alert dismissal
      alert.onDidDismiss().then((result) => {
        console.log('Logout alert dismissed:', result);
        this.isExitAlertOpen = false;
      });
      
      // Present the alert
      await alert.present();
      console.log('Logout alert presented successfully');
      
    } catch (error) {
      console.error('Error showing logout alert:', error);
      this.isExitAlertOpen = false;
    }
  }

  // Add this method to handle the actual logout
  private async performLogout() {
    try {
      // Clear user session
      localStorage.removeItem('userSession');
      
      // Sign out from Firebase
      if (this.locationTrackingService) {
        // Stop location tracking if active
        this.locationTrackingService.stopTracking();
      }
      
      console.log('User logged out via back button');
      
      // Navigate to landing page
      this.router.navigate(['/landing'], { replaceUrl: true });
      
    } catch (error) {
      console.error('Error during logout:', error);
      // Still navigate to landing page even if logout fails
      this.router.navigate(['/landing'], { replaceUrl: true });
    }
  }
}
