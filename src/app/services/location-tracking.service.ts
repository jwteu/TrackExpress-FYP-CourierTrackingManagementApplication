import { Injectable, inject, NgZone, Injector, runInInjectionContext } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import { ParcelService } from './parcel.service';
import { GeocodingService } from './geocoding.service';
import { LocationEnablerService } from './location-enabler.service'; // Import the new service
import firebase from 'firebase/compat/app';
import { Capacitor } from '@capacitor/core'; // Ensure Capacitor is imported
import { firstValueFrom } from 'rxjs'; // If using RxJS toPromise or firstValueFrom
import { Geolocation } from '@capacitor/geolocation';

@Injectable({
  providedIn: 'root'
})
export class LocationTrackingService {
  private auth = inject(AngularFireAuth);
  private parcelService = inject(ParcelService);
  private geocodingService = inject(GeocodingService);
  private locationEnabler = inject(LocationEnablerService); // Inject the new service
  private zone = inject(NgZone);
  private injector = inject(Injector);
  
  // Configuration
  private updateIntervalSeconds = 120; // Update every 2 minutes
  private minimumUpdateDistance = 10; // Minimum 10 meters to update
  private isActive = false;
  private intervalSubscription: Subscription | null = null;
  private isUpdating = false;
  private assignedParcels: any[] = [];
  private isLocationEnabled = false; // Flag to track if location services are enabled

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
    
    // First ensure location is enabled, then request permissions
    this.ensureLocationEnabled().then(enabled => {
      if (enabled) {
        this.requestLocationPermissions().then(granted => {
          if (granted) {
            this.startContinuousTracking();
          } else {
            console.warn('Location permissions denied, tracking disabled');
          }
        });
      } else {
        console.warn('Location services not enabled, tracking disabled');
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
    if (!this.currentUserId || !this.currentUserName) {
      console.log('[LocationTrackingService] No current user, skipping location update.');
      return;
    }
    if (this.isUpdating) {
      console.log('[LocationTrackingService] Update already in progress, skipping.');
      return;
    }
    this.isUpdating = true;
    console.log('[LocationTrackingService] Starting location update cycle.');

    try {
      if (!this.isLocationEnabled) {
        console.log('[LocationTrackingService] Location not enabled, attempting to enable.');
        this.isLocationEnabled = await this.locationEnabler.ensureLocationEnabled();
        if (!this.isLocationEnabled) {
          console.warn('[LocationTrackingService] Location services disabled after check, skipping update.');
          this.isUpdating = false;
          return;
        }
        console.log('[LocationTrackingService] Location enabled successfully.');
      }

      const parcels = await new Promise<any[]>((resolve, reject) => {
        this.parcelService.getAssignedParcelsSecure(this.currentUserName!, this.currentUserId!)
          .subscribe({
            next: (p) => {
              console.log(`[LocationTrackingService] Fetched ${p.length} assigned parcels.`);
              resolve(p);
            },
            error: (err) => {
              console.error('[LocationTrackingService] Error fetching assigned parcels:', err);
              reject(err);
            }
          });
      });

      if (!parcels || parcels.length === 0) {
        console.log('[LocationTrackingService] No assigned parcels for deliveryman, skipping location update for parcels.');
        this.isUpdating = false;
        return;
      }

      let position: any;
      const geolocationOptions = {
        enableHighAccuracy: true,
        timeout: 25000, // Increased timeout to 25 seconds
        maximumAge: 60000 // Accept cached position up to 1 minute old
      };

      if (Capacitor.isPluginAvailable('Geolocation')) {
        console.log('[LocationTrackingService] Using Capacitor Geolocation with options:', geolocationOptions);
        const { Geolocation } = await import('@capacitor/geolocation');
        position = await Geolocation.getCurrentPosition(geolocationOptions);
      } else if (navigator.geolocation) {
        console.log('[LocationTrackingService] Using Browser Geolocation with options:', geolocationOptions);
        position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, geolocationOptions);
        });
      } else {
        console.error('[LocationTrackingService] No Geolocation provider available.');
        this.isUpdating = false;
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const updateTimestamp = new Date();
      console.log(`[LocationTrackingService] Location obtained: Lat ${lat}, Lng ${lng}, Acc ${accuracy}m`);

      let locationDescription = `Near ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        const addressResult = await firstValueFrom(this.geocodingService.getAddressFromCoordinates(lat, lng));
        if (addressResult && addressResult.formatted_address) {
          locationDescription = addressResult.formatted_address;
          console.log(`[LocationTrackingService] Geocoded address: ${locationDescription}`);
        }
      } catch (geoError){
        console.warn('[LocationTrackingService] Geocoding failed:', geoError);
      }

      console.log(`[LocationTrackingService] Updating location for ${parcels.length} assigned parcels.`);
      await Promise.all(
        parcels
          .filter(p => !!p.id)
          .map(p =>
            firstValueFrom(this.parcelService.updateParcelLocation(p.id!, {
              locationLat: lat,
              locationLng: lng,
              locationDescription,
              locationUpdatedAt: updateTimestamp
            }))
          )
      );

      this.lastPosition = { lat, lng };
      this.lastUpdateTime = updateTimestamp;
      this.locationUpdatesSubject.next({ lat, lng, locationDescription, time: updateTimestamp, accuracy });
      console.log('[LocationTrackingService] Location update cycle complete.');

    } catch (err: any) {
      console.error('[LocationTrackingService] Error during location update:', err.message || err);
      if (err.code) {
        console.error(`[LocationTrackingService] Geolocation error code: ${err.code}`); // Log error code if available
      }
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

  // Add this new method to ensure location is enabled
  private async ensureLocationEnabled(): Promise<boolean> {
    try {
      this.isLocationEnabled = await this.locationEnabler.ensureLocationEnabled();
      return this.isLocationEnabled;
    } catch (error) {
      console.error('Error ensuring location is enabled:', error);
      return false;
    }
  }
}