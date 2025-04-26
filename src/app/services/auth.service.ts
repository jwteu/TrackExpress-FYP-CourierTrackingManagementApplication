// Import the location tracking service
import { LocationTrackingService } from './location-tracking.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Add this to your constructor
  constructor(
    private locationTrackingService: LocationTrackingService,
    // ...other services
  ) {}

  // Add this to your login success handler
  private handleSuccessfulLogin(user: any, userData: any) {
    // Store user session data
    const sessionData = {
      uid: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      lastVerified: new Date().toISOString()
    };
    
    localStorage.setItem('userSession', JSON.stringify(sessionData));
    
    // If it's a deliveryman, start location tracking
    if (userData.role === 'deliveryman') {
      this.locationTrackingService.startTracking(userData.id, userData.name);
    }
    
    // Rest of your code...
  }

  // Add this to your logout handler
  async logout() {
    // Stop location tracking
    this.locationTrackingService.stopTracking();
    
    // Clear session
    localStorage.removeItem('userSession');
    
    // Rest of your logout code...
  }
}