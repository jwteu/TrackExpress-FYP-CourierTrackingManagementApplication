import { Component, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { LocationTrackingService } from './services/location-tracking.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, RouterModule]
})
export class AppComponent {
  private locationTrackingService = inject(LocationTrackingService);
  private platform = inject(Platform);

  constructor() {
    console.log('App initialized, location tracking service ready');
    
    // Initialize platform and plugins
    this.initializeApp();
    
    // Force the service to be created when the app starts
    this.locationTrackingService.toString();
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
        
        // Hide splash screen with fade animation
        await SplashScreen.hide({
          fadeOutDuration: 300
        });
      } catch (err) {
        console.error('Error initializing device UI:', err);
      }
    }
  }
}
