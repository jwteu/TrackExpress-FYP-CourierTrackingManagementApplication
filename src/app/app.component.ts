import { Component, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular'; // Remove IonRouterOutlet import
import { RouterModule } from '@angular/router'; // Add RouterModule instead
import { LocationTrackingService } from './services/location-tracking.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, RouterModule] // Replace IonRouterOutlet with RouterModule
})
export class AppComponent {
  private locationTrackingService = inject(LocationTrackingService);

  constructor() {
    console.log('App initialized, location tracking service ready');
    
    // Force the service to be created when the app starts
    this.locationTrackingService.toString();
    
    // The service's constructor will automatically handle the rest
    // - It will monitor the auth state
    // - Start tracking when a deliveryman is logged in
    // - Stop tracking on logout
  }
}
