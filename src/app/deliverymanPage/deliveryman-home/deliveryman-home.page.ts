import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore'; // Add this import
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { LocationTrackingService } from '../../services/location-tracking.service';

@Component({
  selector: 'app-deliveryman-home',
  templateUrl: './deliveryman-home.page.html',
  styleUrls: ['./deliveryman-home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeliverymanHomePage implements OnInit {
  userName: string = ''; // Initialize clearly

  // Add injector for Firebase operations
  private injector = inject(Injector);
  private firestore = inject(AngularFirestore); // Add this line
  // Add this service to your existing injections
  private locationService = inject(LocationTrackingService);

  constructor(
    private router: Router,
    private afAuth: AngularFireAuth
  ) {}

  ngOnInit() {
    this.checkUserSession();
    // Force start location tracking with a slight delay to ensure auth is ready
    setTimeout(() => this.startLocationTracking(), 1000);
  }

  // Replace the existing checkUserSession with this simpler version:
  checkUserSession() {
    const sessionData = localStorage.getItem('userSession');

    if (!sessionData) {
      console.error('No session data found, navigating to login.');
      this.logout(); // Use logout which handles navigation
      return;
    }

    try {
      const userSession = JSON.parse(sessionData);

      // Guards should handle this, but double-check role for safety
      if (!userSession.uid || !userSession.role || userSession.role !== 'deliveryman') {
        console.error('Invalid session data (UID or Role mismatch), logging out.');
        this.logout();
        return;
      }

      // Directly set the username from the validated session
      this.userName = userSession.name || 'Deliveryman'; // Provide a fallback if name is missing

      console.log(`DeliverymanHomePage: Welcome ${this.userName} (UID: ${userSession.uid})`);

    } catch (error) {
      console.error('Error parsing user session:', error);
      this.logout();
    }
  }

  // Add this new method
  startLocationTracking() {
    const sessionData = localStorage.getItem('userSession');
    
    if (sessionData) {
      try {
        const userSession = JSON.parse(sessionData);
        if (userSession.uid && userSession.role === 'deliveryman') {
          console.log('Explicitly starting location tracking service');
          this.locationService.startTracking(userSession.uid, userSession.name);
        }
      } catch (error) {
        console.error('Error parsing session for location tracking:', error);
      }
    }
  }

  navigateTo(page: string) {
    this.router.navigate([page]);
  }

  async logout() {
    this.userName = ''; // Clear the name immediately
    localStorage.removeItem('userSession');

    try {
      await runInInjectionContext(this.injector, () => {
        return this.afAuth.signOut();
      });
      console.log('User signed out');
      // Use navigateRoot to clear navigation stack
      this.router.navigate(['/login'], { replaceUrl: true });
    } catch (error) {
      console.error('Sign out error:', error);
      this.router.navigate(['/login'], { replaceUrl: true }); // Ensure navigation even on error
    }
  }
}