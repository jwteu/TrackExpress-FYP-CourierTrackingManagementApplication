import { Injectable, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import { ParcelService } from './parcel.service';
import { GeocodingService } from './geocoding.service';
import firebase from 'firebase/compat/app';
// Add these imports for Capacitor
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

@Injectable({
  providedIn: 'root'
})
export class LocationTrackingService {
  private auth = inject(AngularFireAuth);
  private parcelService = inject(ParcelService);
  private geocodingService = inject(GeocodingService);
  private zone = inject(NgZone);
  private injector = inject(Injector);
  
  // Configuration
  private updateIntervalSeconds = 120; // Update every 2 minutes
  private minimumUpdateDistance = 10; // Minimum 10 meters to update
  private isActive = false;
  private intervalSubscription: Subscription | null = null;
  private isUpdating = false;
  private assignedParcels: any[] = [];

  // User info
  private currentUserId: string | null = null;
  private currentUserName: string | null = null;
  
  // Observable for components to subscribe to
  private locationUpdatesSubject = new BehaviorSubject<any>(null);
  public locationUpdates$ = this.locationUpdatesSubject.asObservable();
  
  // Position tracking
  private lastPosition: {lat: number, lng: number} | null = null;
  private lastUpdateTime: Date | null = null;

  constructor() {
    console.log('LocationTrackingService initialized');
    this.monitorAuthState();
  }

  private monitorAuthState() {
    this.auth.authState.subscribe(user => {
      if (user) {
        const sessionData = localStorage.getItem('userSession');
        if (sessionData) {
          try {
            const parsedData = JSON.parse(sessionData);
            this.currentUserId = parsedData.uid;
            this.currentUserName = parsedData.name;
            
            if (parsedData.role === 'deliveryman') {
              this.startContinuousTracking();
            }
          } catch (error) {
            console.error('Error parsing user session:', error);
          }
        }
      } else {
        // User logged out, stop tracking
        this.stopContinuousTracking();
      }
    });
  }

  public startTracking(userId: string, userName: string) {
    console.log(`LocationTrackingService: Starting tracking for ${userName} (${userId})`);
    this.currentUserId = userId;
    this.currentUserName = userName;
    
    // Clear any existing tracking first
    this.stopContinuousTracking();
    
    // Request permissions explicitly before starting tracking
    this.requestLocationPermissions().then(granted => {
      if (granted) {
        this.startContinuousTracking();
      } else {
        console.warn('Location permissions denied, tracking disabled');
      }
    });
  }

  public stopTracking() {
    this.stopContinuousTracking();
    this.currentUserId = null;
    this.currentUserName = null;
  }

  public startContinuousTracking() {
    if (this.isActive) return;
    this.isActive = true;

    // Start interval for location updates
    this.intervalSubscription = interval(this.updateIntervalSeconds * 1000).subscribe(() => {
      this.updateLocation();
    });

    // Do an immediate update on start
    this.updateLocation();
    console.log('Location tracking service started');
  }

  public stopContinuousTracking() {
    if (this.intervalSubscription) {
      this.intervalSubscription.unsubscribe();
      this.intervalSubscription = null;
    }
    this.isActive = false;
    console.log('Location tracking service stopped');
  }

  private async updateLocation() {
    if (!this.currentUserId || !this.currentUserName) return;
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      // Get assigned parcels for this deliveryman
      const parcels = await new Promise<any[]>((resolve, reject) => {
        this.parcelService.getAssignedParcelsSecure(this.currentUserName!, this.currentUserId!)
          .subscribe({
            next: resolve,
            error: reject
          });
      });

      if (!parcels || parcels.length === 0) {
        this.isUpdating = false;
        return;
      }

      // Get current location (use Capacitor or browser geolocation)
      let position: any; // Change to 'any' to fix the type error
      if ((window as any).Capacitor?.isPluginAvailable?.('Geolocation')) {
        const { Geolocation } = await import('@capacitor/geolocation');
        position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      } else if (navigator.geolocation) {
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
        });
      } else {
        this.isUpdating = false;
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const updateTimestamp = new Date();

      // Optionally, get address using GeocodingService
      let locationDescription = `Near ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const addressResult = await this.geocodingService.getAddressFromCoordinates(lat, lng).toPromise();
        if (addressResult && addressResult.formatted_address) {
          locationDescription = addressResult.formatted_address;
        }
      } catch {}

      // Update all assigned parcels with new location
      await Promise.all(
        parcels
          .filter(p => !!p.id)
          .map(p =>
            this.parcelService.updateParcelLocation(p.id, {
              locationLat: lat,
              locationLng: lng,
              locationDescription,
              locationUpdatedAt: updateTimestamp
            }).toPromise()
          )
      );

      this.lastPosition = { lat, lng };
      this.lastUpdateTime = updateTimestamp;
      this.locationUpdatesSubject.next({ lat, lng, locationDescription, time: updateTimestamp });
    } catch (err) {
      // Optionally log error
    } finally {
      this.isUpdating = false;
    }
  }

  // Add this new method
  private async requestLocationPermissions(): Promise<boolean> {
    try {
      // Check if running on a native platform
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')) {
        const permStatus = await Geolocation.requestPermissions();
        console.log('Location permission status:', permStatus);
        return permStatus.location === 'granted';
      } else {
        // For web platform, we can check if browser geolocation is available
        if ('geolocation' in navigator) {
          console.log('Using browser geolocation API (permissions handled by browser)');
          // For browsers, we'll do a test getCurrentPosition call to trigger permission prompt
          try {
            await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            return true; // If we get here, permission was granted
          } catch (err) {
            console.warn('Browser denied geolocation permission:', err);
            return false; // Permission was denied
          }
        }
        return true; // If geolocation isn't available, just return true and let it fail later
      }
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }
}