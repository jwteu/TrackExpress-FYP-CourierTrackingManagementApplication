import { Component, OnInit, inject, Injector, runInInjectionContext, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom, Subscription } from 'rxjs';
import { TrackingHistoryService } from '../../services/tracking-history.service';
import { GeocodingService } from '../../services/geocoding.service';
declare const L: any;

// Add your OpenRouteService API key here (register for free at openrouteservice.org)
const ORS_API_KEY = '5b3ce3597851110001cf624890e9ab05b8224e9ea60a53ebf9706174'; // <-- Replace with your key

interface TrackingEvent {
  title: string;
  status: string;
  description: string;
  timestamp: any;
  location: string;
  deliverymanName?: string;
  icon?: string;
  active?: boolean;
  photoURL?: string;
  source?: string; // Track which collection data came from
}

interface AssignedParcelData {
  addedDate?: { seconds: number; nanoseconds: number };
  trackingId: string;
  name?: string;
  locationLat?: number;
  locationLng?: number;
  currentLocation?: string;
  locationDescription?: string;
  status?: string;
  destinationLat?: number; // Add this field
  destinationLng?: number; // Add this field
  destinationName?: string; // Add this field
  distributionHubId?: string; // Add this field
  distributionHubName?: string; // Add this field
}

interface EstimatedDelivery {
  date: Date;
  formattedDate: string;
  dayOfWeek: string;
  timeWindow: string; // Add this property
  daysRemaining: number | null;
}

@Component({
  selector: 'app-tracking-parcel',
  templateUrl: './tracking-parcel.page.html',
  styleUrls: ['./tracking-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class TrackingParcelPage implements OnInit, AfterViewInit, OnDestroy {
  trackingId: string = '';
  parcel: any = null;
  loading: boolean = false;
  searchPerformed: boolean = false;
  trackingEvents: TrackingEvent[] = [];
  estimatedDelivery: EstimatedDelivery | null = null;

  @ViewChild('mapElement') mapElement!: ElementRef;
  mapLoaded: boolean = false;
  map: any;
  mapCoordinates: {
    currentLat: number;
    currentLng: number;
    destLat: number;
    destLng: number;
    currentLocation: string;
    distance?: string;
  } | null = null;

  private firestore = inject(AngularFirestore);
  private router = inject(Router);
  private toastController = inject(ToastController);
  private loadingController = inject(LoadingController);
  private trackingHistoryService = inject(TrackingHistoryService);
  private injector = inject(Injector);
  private geocodingService = inject(GeocodingService);

  private currentLocationMarker: any;
  private destinationMarker: any;
  private routeLine: any;
  private routeOutline: any;
  private locationSubscription: Subscription | null = null;
  public isLocationTracking = false;
  lastLocationUpdate: Date | null = null;

  // Add new tracking state variables
  trackingStatus: 'active' | 'hub' | 'none' = 'none';
  currentDeliverymanName: string | null = null;
  currentDeliverymanId: string | null = null;
  parcelAssignmentSubscription: Subscription | null = null;
  hubModeActive: boolean = false;
  lastDeliverymanName: string | null = null;

  // Add new properties for polling
  private locationPollingInterval: any;
  private pollingFrequency: number = 30000; // Poll every 30 seconds

  constructor() {}

  ngOnInit() {}

  ngAfterViewInit() {
    console.log('View initialized, checking map requirements');
    
    // Handle case when coordinates are already set but map hasn't been initialized yet
    if (this.mapCoordinates && this.mapElement && this.mapElement.nativeElement) {
      console.log('Both coordinates and map element are available, initializing map');
      
      // Wait for DOM to be fully ready
      setTimeout(() => {
        if (!this.mapLoaded) {
          console.log('Initializing map from afterViewInit');
          this.initializeMap();
        }
      }, 500);
    } else {
      console.log('Missing requirements for map initialization:',
        this.mapCoordinates ? 'Coordinates available' : 'No coordinates',
        this.mapElement ? 'Map element reference exists' : 'No map element reference',
        this.mapElement?.nativeElement ? 'Map DOM element exists' : 'No map DOM element'
      );
    }
  }

  ngOnDestroy() {
    // Clean up location subscription when component is destroyed
    this.stopLocationTracking();
    if (this.locationPollingInterval) {
      clearInterval(this.locationPollingInterval);
    }
  }

  async trackParcel() {
    if (!this.trackingId || this.trackingId.trim() === '') {
      const toast = await this.toastController.create({
        message: 'Please enter a tracking ID',
        duration: 2000,
        color: 'warning',
        position: 'top'
      });
      toast.present();
      return;
    }

    // Stop previous location tracking and reset mapLoaded before searching
    this.stopLocationTracking();
    this.mapLoaded = false;

    this.searchPerformed = true;
    this.loading = true;
    this.parcel = null;
    this.trackingStatus = 'none';
    this.hubModeActive = false;

    const loading = await this.loadingController.create({
      message: 'Searching for your parcel...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      await runInInjectionContext(this.injector, async () => {
        const snapshot = await this.firestore.collection('parcels', ref => 
          ref.where('trackingId', '==', this.trackingId.trim())
        ).get().toPromise();

        if (!snapshot || snapshot.empty) {
          console.log('No parcel found with ID:', this.trackingId);
          loading.dismiss();
          this.loading = false;
          return;
        }

        const parcelData = snapshot.docs[0].data() as Record<string, any>;
        
        if (!parcelData['status']) {
          parcelData['status'] = 'Registered';
        }
        
        parcelData['id'] = snapshot.docs[0].id;
        
        await this.buildTrackingEvents(parcelData);
        
        parcelData['trackingEvents'] = this.trackingEvents;
        
        await this.getParcelCoordinates(parcelData);
        
        console.log('Found parcel data:', parcelData);
        
        this.parcel = parcelData;

        // Calculate estimated delivery time
        this.calculateEstimatedDelivery(parcelData);
        
        loading.dismiss();
        this.loading = false;

        console.log('Parcel data loaded:', this.parcel);
        console.log('Map coordinates:', this.mapCoordinates);
        console.log('Map element available:', !!this.mapElement?.nativeElement);
        console.log('Leaflet available:', typeof L !== 'undefined');

        // Start real-time location tracking if the parcel is not delivered
        // Modified to include all active statuses, not just Out for Delivery
        if (this.parcel.status !== 'Delivered') {
          // IMPORTANT FIX: Use an async function with runInInjectionContext
          await runInInjectionContext(this.injector, async () => {
            this.startLocationTracking(this.trackingId);
          });
        }
      });
    } catch (error) {
      console.error('Error searching for parcel:', error);
      
      // More specific error message
      let errorMessage = 'An error occurred while searching. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('map')) {
          errorMessage = 'Error loading map. Please try again.';
          console.error('Map specific error:', error.message);
        } else if (error.message.includes('geocod')) {
          errorMessage = 'Error finding address coordinates. Map may be limited.';
          console.error('Geocoding error:', error.message);
        }
      }
      
      this.showErrorToast(errorMessage);
      this.parcel = null;
      loading.dismiss();
      this.loading = false;
    }
  }

  startLocationTracking(trackingId: string) {
    // Stop any existing tracking first
    this.stopLocationTracking();
    
    console.log('Starting real-time location tracking for', trackingId);
    this.isLocationTracking = true;
    
    // First check if parcel is assigned to a deliveryman
    runInInjectionContext(this.injector, () => {
      this.parcelAssignmentSubscription = this.firestore.collection('assigned_parcels', ref => 
        ref.where('trackingId', '==', trackingId)
      ).snapshotChanges().subscribe({
        next: (snapshots) => {
          if (snapshots.length === 0) {
            console.log('Parcel not currently assigned to any deliveryman');
            // Handle hub mode - parcel is not assigned
            this.handleHubMode();
            return;
          }
          
          // Parcel is assigned to a deliveryman
          const parcelData = snapshots[0].payload.doc.data() as any;
          
          // Check if deliveryman has changed
          if (this.currentDeliverymanId !== parcelData.userId) {
            // Deliveryman has changed, update info
            this.currentDeliverymanId = parcelData.userId || null;
            this.currentDeliverymanName = parcelData.name || 'Unknown';
            
            console.log(`Parcel now handled by: ${this.currentDeliverymanName}`);
            
            // Show a toast about the new deliveryman
            if (this.lastDeliverymanName && this.lastDeliverymanName !== this.currentDeliverymanName) {
              this.showInfoToast(`Parcel transferred to ${this.currentDeliverymanName}`);
            }
            
            this.lastDeliverymanName = this.currentDeliverymanName;
          }
          
          // Exit hub mode if we were in it
          if (this.hubModeActive) {
            this.hubModeActive = false;
            
            // Show toast notification that tracking is active again
            this.showInfoToast(`Tracking resumed with ${this.currentDeliverymanName}`);
          }

          this.trackingStatus = 'active';
          
          // If we have location data in the document, update the map immediately
          if (parcelData && parcelData.locationLat && parcelData.locationLng) {
            console.log('Got location data from assignment document:', 
              parcelData.locationLat, 
              parcelData.locationLng, 
              parcelData.locationUpdatedAt?.toDate?.() || 'no timestamp');
            
            this.updateMapWithNewLocation(
              parcelData.locationLat,
              parcelData.locationLng,
              parcelData.locationDescription || 'Current Location',
              true // This is a new location, animate transition
            );
            
            this.lastLocationUpdate = new Date(parcelData.locationUpdatedAt?.toDate?.() || new Date());
          }
        },
        error: (err) => {
          console.error('Error monitoring parcel assignment:', err);
          this.trackingStatus = 'none';
          this.isLocationTracking = false;
        }
      });
    });
    
    // Subscribe to location updates from the geocoding service with real-time updates
    runInInjectionContext(this.injector, () => {
      this.locationSubscription = this.geocodingService.getDeliverymanLocationUpdates(trackingId)
        .subscribe({
          next: (locationData) => {
            if (locationData && locationData.lat && locationData.lng) {
              console.log('Received location update:', locationData);
              this.lastLocationUpdate = new Date(locationData.timestamp?.toDate?.() || new Date());
              
              // Update map with new location
              this.updateMapWithNewLocation(
                locationData.lat,
                locationData.lng,
                locationData.locationDescription || 'Current Location',
                false // Regular update, don't need special animation
              );
            }
          },
          error: (err) => {
            console.error('Error tracking location:', err);
            this.isLocationTracking = false;
          }
        });
    });
    
    // Add a polling mechanism as backup
    this.startLocationPolling(trackingId);
  }
  
  // Add a new method to implement polling
  private startLocationPolling(trackingId: string) {
    console.log(`Setting up location polling every ${this.pollingFrequency/1000} seconds`);
    
    // Clear any existing interval
    if (this.locationPollingInterval) {
      clearInterval(this.locationPollingInterval);
      this.locationPollingInterval = null;
    }
    
    // Set up polling interval to check for location updates
    this.locationPollingInterval = setInterval(() => {
      console.log(`Polling for location updates for ${trackingId}`);
      // Only poll if we're still tracking
      if (this.isLocationTracking && this.trackingStatus !== 'none') {
        // Use the refresh method to fetch the latest data
        this.refreshLocationData(trackingId);
      }
    }, this.pollingFrequency);
  }
  
  // Add this method to manually refresh location data
  private async refreshLocationData(trackingId: string) {
    try {
      const snapshot = await runInInjectionContext(this.injector, () => 
        firstValueFrom(
          this.firestore.collection('assigned_parcels', ref => 
            ref.where('trackingId', '==', trackingId)
          ).get()
        )
      );
      
      if (!snapshot.empty) {
        const parcelData = snapshot.docs[0].data() as any;
        
        if (parcelData.locationLat && parcelData.locationLng) {
          const updateTimestamp = parcelData.locationUpdatedAt?.toDate?.() || new Date();
          
          // Only update if it's a new location (different timestamp)
          if (!this.lastLocationUpdate || 
              updateTimestamp.getTime() > this.lastLocationUpdate.getTime()) {
            
            console.log('Polled and found updated location:', parcelData.locationLat, parcelData.locationLng);
            this.lastLocationUpdate = updateTimestamp;
            
            // Update map with new location
            this.updateMapWithNewLocation(
              parcelData.locationLat,
              parcelData.locationLng,
              parcelData.locationDescription || 'Current Location',
              false
            );
          }
        }
      }
    } catch (error) {
      console.warn('Error polling for location:', error);
    }
  }
  
  stopLocationTracking() {
    if (this.locationSubscription) {
      console.log('Stopping location tracking');
      this.locationSubscription.unsubscribe();
      this.locationSubscription = null;
    }
    
    if (this.locationPollingInterval) {
      console.log('Stopping location polling');
      clearInterval(this.locationPollingInterval);
      this.locationPollingInterval = null;
    }
    
    if (this.parcelAssignmentSubscription) {
      console.log('Stopping parcel assignment monitoring');
      this.parcelAssignmentSubscription.unsubscribe();
      this.parcelAssignmentSubscription = null;
    }
    
    this.isLocationTracking = false;
    this.trackingStatus = 'none';
    this.currentDeliverymanName = null;
    this.currentDeliverymanId = null;
  }

  // Handle the case when parcel is at a hub/warehouse (not assigned to any deliveryman)
  handleHubMode() {
    if (this.hubModeActive) {
      return; // Already in hub mode
    }
    
    console.log('Parcel is currently at hub/warehouse');
    this.hubModeActive = true;
    this.trackingStatus = 'hub';
    
    // Show message to user
    this.showInfoToast('Parcel is currently at distribution center');
    
    // If we have a map with a current location, we'll freeze it there
    // and update the marker to show it's at a hub
    if (this.map && this.currentLocationMarker) {
      // Update the marker icon to show it's at a hub
      this.currentLocationMarker.setIcon(
        L.divIcon({
          html: `<div style="font-size: 14px; background: #6c757d; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; position: relative;">
            <ion-icon name="business-outline" style="font-size: 24px; color: #fff;"></ion-icon>
            <div style="position: absolute; bottom: -20px; white-space: nowrap; background: rgba(0,0,0,0.7); color: white; padding: 2px 5px; border-radius: 3px; font-size: 10px;">Distribution Center</div>
          </div>`,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      );
      
      // Update popup content
      this.currentLocationMarker.setPopupContent(`Distribution Center: Awaiting next handler`);
    }
  }

  async buildTrackingEvents(parcelData: Record<string, any>) {
    this.trackingEvents = [];
    
    // Always add the registration event
    this.trackingEvents.push({
      title: 'Pickup',
      status: 'Registered',
      description: `Parcel registered at ${parcelData['pickupLocation'] || 'origin'}`,
      timestamp: parcelData['createdAt'] || parcelData['date'] || new Date(),
      location: parcelData['pickupLocation'] || 'Origin Facility',
      icon: 'create-outline',
      active: true,
      source: 'parcels'
    });
    
    // Load tracking history events
    console.log('Loading tracking history for:', this.trackingId);
    try {
      const trackingHistory = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(this.trackingHistoryService.getTrackingHistory(this.trackingId));
      });
      
      if (trackingHistory && trackingHistory.length > 0) {
        console.log(`Found ${trackingHistory.length} tracking history events`);
        
        // Filter out handler events, only keep main status events
        const filteredHistory = trackingHistory.filter(event => 
          event.status === 'Registered' || 
          event.status === 'In Transit' || 
          event.status === 'Out for Delivery' || 
          event.status === 'Delivered'
        );
        
        // Map the filtered events to timeline events
        const historyEvents = this.mapTrackingEvents(filteredHistory);
        
        // Add the filtered events to tracking events
        historyEvents.forEach(event => {
          // Check for duplicates before adding
          const isDuplicate = this.trackingEvents.some(existing => 
            existing.status === event.status && 
            this.isSameTimestamp(existing.timestamp, event.timestamp)
          );
          
          if (!isDuplicate) {
            this.trackingEvents.push(event);
          }
        });
      } else {
        console.log('No tracking history events found');
      }
    } catch (error) {
      console.error('Error loading tracking history:', error);
    }
    
    // Only add a separate "Out for Delivery" event if there's none already
    const hasOutForDeliveryEvent = this.trackingEvents.some(
      event => event.status === 'Out for Delivery'
    );
    
    if (parcelData['status'] === 'Out for Delivery' && !hasOutForDeliveryEvent) {
      this.trackingEvents.push({
        title: 'Out for Delivery',
        status: 'Out for Delivery',
        description: 'Parcel is out for delivery to recipient',
        timestamp: parcelData['updatedAt'] || new Date(),
        location: parcelData['locationDescription'] || 'Current Delivery Location',
        deliverymanName: parcelData['deliverymanName'],
        icon: 'bicycle-outline',
        active: true,
        source: 'parcels'
      });
    } 
    
    // Always add delivered event if the parcel is delivered
    const hasDeliveredEvent = this.trackingEvents.some(
      event => event.status === 'Delivered'
    );
    
    if (parcelData['status'] === 'Delivered' && !hasDeliveredEvent) {
      this.trackingEvents.push({
        title: 'Delivered',
        status: 'Delivered',
        description: 'Parcel has been delivered successfully',
        timestamp: parcelData['deliveryCompletedDate'] || parcelData['updatedAt'] || new Date(),
        location: parcelData['locationDescription'] || parcelData['receiverAddress'] || 'Delivery Address',
        deliverymanName: parcelData['deliverymanName'],
        photoURL: parcelData['photoURL'],
        icon: 'checkmark-circle-outline',
        active: true,
        source: 'parcels'
      });
    }
    
    this.sortTrackingEvents();
  }

  async getParcelCoordinates(parcelData: any) {
    // Default coordinates for Kuala Lumpur (fallback)
    const KL_LAT = 3.1390;
    const KL_LNG = 101.6869;
    
    let currentLat = KL_LAT;
    let currentLng = KL_LNG;
    let currentLocation = 'Origin';
    
    // Set default destination coordinates
    let destLat = KL_LAT + 0.02;
    let destLng = KL_LNG + 0.02;
    let destinationName = '';
    
    try {
      // CASE 1: PENDING PARCEL (not assigned to deliveryman)
      if (parcelData.status === 'Pending' || parcelData.status === 'Registered') {
        console.log('Handling pending parcel - showing pickup to receiver route');
        
        // For current location (origin), use pickup location coordinates if available
        if (parcelData.pickupLat && parcelData.pickupLng) {
          currentLat = parcelData.pickupLat;
          currentLng = parcelData.pickupLng;
          currentLocation = parcelData.pickupLocation || 'Pickup Location';
        } else if (parcelData.pickupLocation) {
          // Try to geocode the pickup location if we only have the address
          try {
            const pickupGeocode = await runInInjectionContext(this.injector, () => {
              return firstValueFrom(this.geocodingService.getCoordinatesFromAddress(parcelData.pickupLocation));
            });
            
            if (pickupGeocode && pickupGeocode.lat && pickupGeocode.lon) {
              currentLat = pickupGeocode.lat;
              currentLng = pickupGeocode.lon;
              currentLocation = parcelData.pickupLocation;
              console.log(`Using geocoded pickup location: ${currentLat}, ${currentLng}`);
            }
          } catch (error) {
            console.warn('Could not geocode pickup address:', error);
          }
        }
        
        // For destination, use receiver coordinates if available
        if (parcelData.receiverLat && parcelData.receiverLng) {
          destLat = parcelData.receiverLat;
          destLng = parcelData.receiverLng;
          destinationName = parcelData.receiverAddress || 'Delivery Address';
        } else if (parcelData.receiverAddress) {
          // Try to geocode the receiver address
          try {
            const receiverGeocode = await runInInjectionContext(this.injector, () => {
              return firstValueFrom(this.geocodingService.getCoordinatesFromAddress(parcelData.receiverAddress));
            });
            
            if (receiverGeocode && receiverGeocode.lat && receiverGeocode.lon) {
              destLat = receiverGeocode.lat;
              destLng = receiverGeocode.lon;
              destinationName = parcelData.receiverAddress;
              console.log(`Using geocoded receiver address: ${destLat}, ${destLng}`);
            }
          } catch (error) {
            console.warn('Could not geocode receiver address:', error);
          }
        }
      } 
      // CASE 2: IN TRANSIT (parcel assigned to deliveryman, going to distribution hub)
      else if (parcelData.status === 'In Transit') {
        console.log('Handling In Transit parcel - showing deliveryman to hub route');
        
        // For current location, use the deliveryman's last known location
        if (parcelData.locationLat && parcelData.locationLng) {
          currentLat = parcelData.locationLat;
          currentLng = parcelData.locationLng;
          currentLocation = parcelData.locationDescription || 'Deliveryman Location';
        }
        
        // For destination, use the selected distribution hub
        if (parcelData.destinationLat && parcelData.destinationLng) {
          destLat = parcelData.destinationLat;
          destLng = parcelData.destinationLng;
          destinationName = parcelData.distributionHubName || parcelData.destinationName || 'Distribution Hub';
        }
      } 
      // CASE 3: OUT FOR DELIVERY (parcel assigned to deliveryman, going to receiver)
      else if (parcelData.status === 'Out for Delivery') {
        console.log('Handling Out for Delivery parcel - showing deliveryman to receiver route');
        
        // For current location, use the deliveryman's last known location
        if (parcelData.locationLat && parcelData.locationLng) {
          currentLat = parcelData.locationLat;
          currentLng = parcelData.locationLng;
          currentLocation = parcelData.locationDescription || 'Deliveryman Location';
        }
        
        // For destination, try to use receiver coordinates
        if (parcelData.receiverLat && parcelData.receiverLng) {
          destLat = parcelData.receiverLat;
          destLng = parcelData.receiverLng;
          destinationName = parcelData.receiverAddress || 'Delivery Address';
        } else if (parcelData.receiverAddress) {
          // Try to geocode the receiver address
          try {
            const receiverGeocode = await runInInjectionContext(this.injector, () => {
              return firstValueFrom(this.geocodingService.getCoordinatesFromAddress(parcelData.receiverAddress));
            });
            
            if (receiverGeocode && receiverGeocode.lat && receiverGeocode.lon) {
              destLat = receiverGeocode.lat;
              destLng = receiverGeocode.lon;
              destinationName = parcelData.receiverAddress;
            }
          } catch (error) {
            console.error('Error geocoding receiver address:', error);
          }
        }
      }
      // CASE 4: DEFAULT - Any other status
      else {
        console.log(`Handling parcel with status ${parcelData.status} - using default routes`);
        
        // For current location, try to use tracking events
        if (this.trackingEvents.length > 0) {
          // Find the most recent event with location data
          for (let i = this.trackingEvents.length - 1; i >= 0; i--) {
            const event = this.trackingEvents[i];
            if (event.location) {
              currentLocation = event.location;
              break;
            }
          }
        }
        
        // For destination, try to use receiver address
        if (parcelData.receiverAddress) {
          try {
            const geocodeResult = await runInInjectionContext(this.injector, () => {
              return firstValueFrom(this.geocodingService.getCoordinatesFromAddress(parcelData.receiverAddress));
            });
            
            if (geocodeResult && geocodeResult.lat && geocodeResult.lon) {
              destLat = geocodeResult.lat;
              destLng = geocodeResult.lon;
              destinationName = parcelData.receiverAddress;
            }
          } catch (error) {
            console.error('Error geocoding receiver address:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error processing parcel coordinates:', error);
    }
    
    // Set coordinates, ensuring we always have valid numbers
    this.mapCoordinates = {
      currentLat: Number(currentLat) || KL_LAT,
      currentLng: Number(currentLng) || KL_LNG,
      destLat: Number(destLat) || (Number(currentLat) + 0.02 || KL_LAT + 0.02),
      destLng: Number(destLng) || (Number(currentLng) + 0.02 || KL_LNG + 0.02),
      currentLocation
    };
    
    console.log('Final map coordinates:', this.mapCoordinates);
    
    // Ensure any existing map is properly destroyed before initializing a new one
    if (this.map) {
      console.log('Destroying existing map before creating new one');
      this.cleanupMap();
    }
    
    // Add a slightly longer delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 500));
    this.initializeMap();
  }

  // Add this method to properly clean up the map
  private cleanupMap() {
    if (this.currentLocationMarker) {
      this.currentLocationMarker.remove();
      this.currentLocationMarker = null;
    }
    
    if (this.destinationMarker) {
      this.destinationMarker.remove();
      this.destinationMarker = null;
    }
    
    if (this.routeLine && this.map) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }
    
    if (this.routeOutline && this.map) {
      this.map.removeLayer(this.routeOutline);
      this.routeOutline = null;
    }
    
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    
    this.mapLoaded = false;
  }

  // Add this property to your component
  private mapInitializationInProgress = false;
  private mapInitDebounceTimer: any = null;

  async initializeMap(): Promise<boolean> {
    // Debounce map initialization to prevent multiple simultaneous attempts
    if (this.mapInitDebounceTimer) {
      clearTimeout(this.mapInitDebounceTimer);
    }
    
    return new Promise((resolve) => {
      this.mapInitDebounceTimer = setTimeout(async () => {
        // Check if initialization is already in progress
        if (this.mapInitializationInProgress) {
          console.log('Map initialization already in progress, skipping');
          resolve(false);
          return;
        }
        
        this.mapInitializationInProgress = true;
        console.log('Initializing map with coordinates:', this.mapCoordinates);

        if (!this.mapCoordinates || !this.mapElement?.nativeElement) {
          console.error('Missing map coordinates or element');
          this.mapInitializationInProgress = false;
          resolve(false);
          return;
        }

        // --- IMPROVED MAP CLEANUP ---
        try {
          // First, clean up any existing map instance
          if (this.map) {
            console.log('Cleaning up existing map instance');
            
            // Remove markers first
            if (this.currentLocationMarker) {
              this.currentLocationMarker.remove();
              this.currentLocationMarker = null;
            }
            
            if (this.destinationMarker) {
              this.destinationMarker.remove();
              this.destinationMarker = null;
            }
            
            // Remove routes
            if (this.routeLine) {
              this.map.removeLayer(this.routeLine);
              this.routeLine = null;
            }
            
            if (this.routeOutline) {
              this.map.removeLayer(this.routeOutline);
              this.routeOutline = null;
            }
            
            // Unsubscribe all events
            this.map.off();
            // Remove the map
            this.map.remove();
            this.map = null;
          }
          
          // Clear the DOM element
          if (this.mapElement && this.mapElement.nativeElement) {
            this.mapElement.nativeElement.innerHTML = '';
          }
          
          // Small delay to ensure DOM is ready after clearing
          await new Promise(r => setTimeout(r, 50));
          
          const { currentLat, currentLng, destLat, destLng } = this.mapCoordinates;

          // Ensure Leaflet is loaded
          if (typeof L === 'undefined') {
            await this.loadLeafletDynamically();
          }

          // Double-check if the element is still available (navigation could have happened)
          if (!this.mapElement?.nativeElement || !this.mapElement.nativeElement.parentElement) {
            console.error('Map container is no longer in the DOM');
            this.mapInitializationInProgress = false;
            resolve(false);
            return;
          }

          // Create new map instance
          this.map = L.map(this.mapElement.nativeElement, {
            zoomControl: true,
            attributionControl: false
          }).setView([currentLat, currentLng], 13);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(this.map);

          // Rest of your map initialization code...
          // Add current location marker
          this.currentLocationMarker = L.marker([currentLat, currentLng], {
            icon: L.divIcon({
              html: `<div style="font-size: 14px; background: #FFDE59; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; position: relative;">
                <ion-icon name="bicycle-outline" style="font-size: 24px; color: #333;"></ion-icon>
                <div style="position: absolute; bottom: -20px; white-space: nowrap; background: rgba(0,0,0,0.7); color: white; padding: 2px 5px; border-radius: 3px; font-size: 10px;">Current Location</div>
              </div>`,
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            })
          }).addTo(this.map)
            .bindPopup(`Current Location: ${this.mapCoordinates.currentLocation}`);

          // Add destination marker
          this.destinationMarker = L.marker([destLat, destLng], {
            icon: L.divIcon({
              html: `<div style="font-size: 14px; background: white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; position: relative;">
                <ion-icon name="home-outline" style="font-size: 24px; color: #333;"></ion-icon>
                <div style="position: absolute; bottom: -20px; white-space: nowrap; background: rgba(0,0,0,0.7); color: white; padding: 2px 5px; border-radius: 3px; font-size: 10px;">Destination</div>
              </div>`,
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            })
          }).addTo(this.map)
            .bindPopup(`Destination: ${this.parcel?.receiverAddress || 'Delivery Address'}`);

          // Draw the route
          await this.drawRouteWithOpenRouteService(currentLat, currentLng, destLat, destLng);

          this.mapLoaded = true;
          this.mapInitializationInProgress = false;
          resolve(true);
        } catch (error) {
          console.error('Error in map initialization:', error);
          this.mapInitializationInProgress = false;
          resolve(false);
        }
      }, 300); // Small debounce delay
    });
  }

  updateMapWithNewLocation(lat: number, lng: number, locationDescription: string, isNewHandler: boolean = false) {
    // Check if map exists and initialize it if needed
    if (!this.map && this.mapElement?.nativeElement && this.mapCoordinates) {
      console.log('Map not initialized yet, initializing now...');
      this.initializeMap().then(() => {
        // After map is initialized, try updating the location again
        if (this.map && this.currentLocationMarker) {
          this.updateMapWithNewLocationInternal(lat, lng, locationDescription, isNewHandler);
        }
      });
      return;
    }
    
    if (!this.map || !this.currentLocationMarker || !this.mapCoordinates) {
      console.error('Map not initialized or marker not created, cannot update location');
      return;
    }
    
    this.updateMapWithNewLocationInternal(lat, lng, locationDescription, isNewHandler);
  }

  private updateMapWithNewLocationInternal(lat: number, lng: number, locationDescription: string, isNewHandler: boolean = false) {
    // IMPORTANT: Add strict validation to filter out bad coordinate data
    if (!this.isValidCoordinate(lat) || !this.isValidCoordinate(lng)) {
      console.error('Invalid coordinates received:', lat, lng);
      return; // Exit early instead of trying to update with invalid data
    }

    // Update the stored coordinates
    this.mapCoordinates!.currentLat = lat;
    this.mapCoordinates!.currentLng = lng;
    this.mapCoordinates!.currentLocation = locationDescription || 'Current Location';

    // Update the marker position with animation
    if (isNewHandler) {
      // For new handler, use a fly animation
      this.map.flyTo([lat, lng], 14, {
        animate: true,
        duration: 1.5
      });

      // Update the marker position
      this.currentLocationMarker.setLatLng([lat, lng]);
    } else {
      // For regular updates, smoothly update the marker position
      this.currentLocationMarker.setLatLng([lat, lng]);
      
      // Center the map if we're actively tracking
      if (this.isLocationTracking && !this.hubModeActive) {
        this.map.panTo([lat, lng], {
          animate: true,
          duration: 0.5
        });
      }
    }

    // Update the popup content
    let popupContent = `Current Location: ${locationDescription}`;
    if (this.currentDeliverymanName) {
      popupContent += `<br>Handled by: ${this.currentDeliverymanName}`;
    }
    this.currentLocationMarker.setPopupContent(popupContent);

    // IMPORTANT: Draw route from current location to destination for all parcel statuses
    // Always use receiver address as destination if available
    if (this.mapCoordinates?.destLat && this.mapCoordinates?.destLng) {
      console.log('Drawing route to destination:', this.mapCoordinates.destLat, this.mapCoordinates.destLng);
      
      this.drawRouteWithOpenRouteService(
        lat, lng,  // FROM current location
        this.mapCoordinates.destLat, this.mapCoordinates.destLng,  // TO destination
        isNewHandler
      );
      
      // Update destination marker
      if (this.destinationMarker) {
        this.destinationMarker.setLatLng([this.mapCoordinates.destLat, this.mapCoordinates.destLng]);
        
        // Set appropriate popup content based on status
        if (this.parcel && this.parcel.status === 'In Transit') {
          this.destinationMarker.setPopupContent(
            `Distribution Hub: ${this.parcel.distributionHubName || this.parcel.destinationName || 'Distribution Center'}`
          );
        } else {
          this.destinationMarker.setPopupContent(
            `Destination: ${this.parcel?.receiverAddress || 'Delivery Address'}`
          );
        }
      }
    } else {
      console.log('No valid destination coordinates found, cannot draw route');
    }
  }

  private isValidCoordinate(coord: any): boolean {
    // More strict validation to catch edge cases
    return coord !== null && 
           coord !== undefined &&
           !isNaN(coord) && 
           typeof coord === 'number' && 
           isFinite(coord) &&
           Math.abs(coord) <= 180;  
  }

  async drawRouteWithOpenRouteService(startLat: number, startLng: number, endLat: number, endLng: number, isNewHandler: boolean = false) {
  try {
    // Remove previous route if exists by reference
    if (this.routeLine && this.map.hasLayer(this.routeLine)) {
      this.map.removeLayer(this.routeLine);
    }
    this.routeLine = null;

    if (this.routeOutline && this.map.hasLayer(this.routeOutline)) {
      this.map.removeLayer(this.routeOutline);
    }
    this.routeOutline = null;

    // More robust cleanup: Iterate over all layers and remove any with a 'route-polyline' class
    if (this.map) {
      this.map.eachLayer((layer: any) => {
        if (layer.options && layer.options.className === 'route-polyline') {
          this.map.removeLayer(layer);
        }
      });
    }

    // IMPORTANT: Add validation before making API call
    if (!this.isValidCoordinate(startLat) || !this.isValidCoordinate(startLng) || 
        !this.isValidCoordinate(endLat) || !this.isValidCoordinate(endLng)) {
      console.warn('Invalid coordinates for routing:', startLat, startLng, endLat, endLng);
      this.drawSimpleRoute(startLat, startLng, endLat, endLng);
      return;
    }

    // Format coordinates for OpenRouteService API
    // NOTE: We're requesting extra_info for more detailed path data
    const body = JSON.stringify({
      coordinates: [[startLng, startLat], [endLng, endLat]],
      preference: "recommended",
      format: "geojson",
      instructions: false,
      elevation: false,
      extra_info: ["steepness", "waytype", "surface"],
      geometry_simplify: false
    });

    console.log(`Requesting route from [${startLng},${startLat}] to [${endLng},${endLat}]`);

    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car/geojson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ORS_API_KEY // Make sure ORS_API_KEY is defined correctly
        },
        body: body
      }
    );

    if (!response.ok) {
      // *** Log detailed error response ***
      const errorText = await response.text(); // Get error details from API if possible
      console.error(`API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // *** Log the full API response ***
    // Use JSON.stringify to see the structure clearly in the console
    console.log('Full Route data received:', JSON.stringify(data, null, 2));

    // Check if the expected data structure exists
    if (data.features && data.features.length > 0 && data.features[0].geometry && data.features[0].geometry.coordinates) {
      const coords = data.features[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]); // Swap LngLat to LatLng for Leaflet

      // *** Log the number of points received ***
      console.log(`Route received with ${coords.length} points.`);

      if (coords.length < 5) { // Add a warning if very few points are received
          console.warn(`Warning: Received very few points (${coords.length}) for the route. API might be simplifying heavily.`);
      }

      // Draw the main route line
      this.routeLine = L.polyline(coords, {
        color: this.hubModeActive ? '#6c757d' : '#FFDE59', // Use your theme color
        weight: 6,
        opacity: this.hubModeActive ? 0.7 : 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: this.hubModeActive ? '10, 10' : null,
        className: 'route-polyline' // Add className
      }).addTo(this.map);

      // Draw the outline
      this.routeOutline = L.polyline(coords, {
        color: '#333333', // Dark outline
        weight: 10,
        opacity: 0.3,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'route-polyline' // Add className
      }).addTo(this.map);

      this.routeOutline.bringToBack(); // Ensure outline is behind main line
      this.routeLine.bringToFront();

      // Fit map to route bounds
      this.map.fitBounds(this.routeLine.getBounds(), {
        padding: [40, 40], // Add some padding
        maxZoom: 15 // Limit max zoom level
      });

    } else {
      // *** Log if no features/coordinates found ***
      console.warn('No route features or coordinates found in API response.');
      throw new Error('No route found in response');
    }
  } catch (error) {
    // *** Ensure the error itself is logged ***
    console.error('Error drawing route with OpenRouteService:', error);
    // Fallback to a simple straight line route
    this.drawSimpleRoute(startLat, startLng, endLat, endLng);
  }
}

  drawSimpleRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
    try {
      // Clean up ALL existing route layers first
      this.cleanupAllRouteLayers();
    
      // Create a straight line between points - only from current to destination
      this.routeLine = L.polyline([
          [startLat, startLng],
          [endLat, endLng]
      ], {
          color: this.hubModeActive ? '#6c757d' : '#FFDE59',
          weight: 5,
          opacity: 0.8,
          dashArray: '10, 10',
          className: 'route-polyline'
      }).addTo(this.map);
    
      // Fit map to show both points
      this.map.fitBounds(this.routeLine.getBounds(), { 
          padding: [50, 50],
          maxZoom: 14 
      });
    
      if (this.mapCoordinates) {
          const distance = this.calculateDistance(startLat, startLng, endLat, endLng);
          this.mapCoordinates.distance = `${distance.toFixed(2)} km`;
      }
    } catch (error) {
      console.error('Error drawing simple route:', error);
    }
  }

  // Add this helper method for thorough route cleanup
  private cleanupAllRouteLayers() {
    // Remove by reference if possible
    if (this.routeLine && this.map && this.map.hasLayer(this.routeLine)) {
      this.map.removeLayer(this.routeLine);
    }
    this.routeLine = null;

    if (this.routeOutline && this.map && this.map.hasLayer(this.routeOutline)) {
      this.map.removeLayer(this.routeOutline);
    }
    this.routeOutline = null;

    // Be thorough - remove ALL layers with route-polyline class
    if (this.map) {
      this.map.eachLayer((layer: any) => {
        if (layer.options && layer.options.className === 'route-polyline') {
          this.map.removeLayer(layer);
        }
      });
    }
  }
  
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Simple haversine formula
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
  }

  deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  async loadLeafletDynamically(): Promise<void> {
    return new Promise((resolve) => {
      // Skip if already loaded
      if (typeof L !== 'undefined') {
        console.log('Leaflet already loaded, skipping dynamic load');
        resolve();
        return;
      }
      
      console.log('Attempting to load Leaflet dynamically');
      
      // Create link element for CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      
      // Create script element
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        console.log('Leaflet loaded dynamically');
        resolve();
      };
      
      script.onerror = () => {
        console.error('Failed to load Leaflet dynamically');
        resolve(); // Resolve anyway to continue execution
      };
      
      document.head.appendChild(script);
    });
  }

  // Add this method before openExternalMap()
  async refreshLocationBeforeOpeningMap(): Promise<void> {
    // Only try to refresh if we're tracking a parcel
    if (!this.isLocationTracking || !this.trackingId) {
      return;
    }
    
    const loading = await this.loadingController.create({
      message: 'Getting latest location...',
      duration: 3000, // Maximum 3 seconds wait
      spinner: 'dots'
    });
    
    await loading.present();
    
    try {
      // Get the most current location data using runInInjectionContext
      await runInInjectionContext(this.injector, async () => {
        try {
          const snapshot = await firstValueFrom(
            this.firestore.collection('assigned_parcels', ref => 
              ref.where('trackingId', '==', this.trackingId)
            ).get()
          );
          
          if (!snapshot.empty) {
            const parcelData = snapshot.docs[0].data() as any;
            
            if (parcelData.locationLat && parcelData.locationLng) {
              // Update our stored coordinates with the latest data
              if (this.mapCoordinates) {
                this.mapCoordinates.currentLat = parcelData.locationLat;
                this.mapCoordinates.currentLng = parcelData.locationLng;
                this.mapCoordinates.currentLocation = parcelData.locationDescription || 'Current Location';
                
                console.log('Updated to latest coordinates before opening map:', 
                  this.mapCoordinates.currentLat, 
                  this.mapCoordinates.currentLng);
                
                // Also update the map if it exists
                if (this.map && this.currentLocationMarker) {
                  this.currentLocationMarker.setLatLng([
                    this.mapCoordinates.currentLat, 
                    this.mapCoordinates.currentLng
                  ]);
                }
              }
            }
          }
        } catch (queryError) {
          console.error('Error fetching location data:', queryError);
        }
      });
    } catch (error) {
      console.error('Error refreshing location data:', error);
      // Continue anyway with the coordinates we have
    } finally {
      loading.dismiss();
    }
  }

  // Now modify the openExternalMap method to call this first
  async openExternalMap() {
    // Refresh location data first to ensure it's up-to-date
    await this.refreshLocationBeforeOpeningMap();
    
    if (!this.mapCoordinates) {
      return;
    }
    
    const { currentLat, currentLng } = this.mapCoordinates;
    
    // Add timestamp to force refresh of coordinates
    const timestamp = new Date().getTime();
    
    // Determine which maps app to use based on platform capabilities
    if (this.isPlatformNative()) {
      // For mobile devices: Use platform-specific maps for current location only
      if (this.isIOS()) {
        // iOS: Use Apple Maps to show current location only
        const url = `maps://maps.apple.com/?ll=${currentLat},${currentLng}&q=Current+Location&t=${timestamp}`;
        window.open(url, '_system');
        
        this.showInfoToast('Opening Apple Maps to current location.');
      } else {
        // Android: Use Google Maps to show current location only
        const url = `geo:${currentLat},${currentLng}?q=${currentLat},${currentLng}`;
        window.open(url, '_system');
        
        // Fallback for devices without Google Maps app installed
        setTimeout(() => {
          const webUrl = `https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}&t=${timestamp}`;
          window.open(webUrl, '_system');
        }, 1000);
        
        this.showInfoToast('Opening maps to current location.');
      }
    } else {
      // For browsers: Use Google Maps with current location only
      const url = `https://www.google.com/maps/search/?api=1&query=${currentLat},${currentLng}&t=${timestamp}`;
      
      window.open(url, '_blank');
      
      this.showInfoToast('Maps opened showing current location.');
    }
  }

  // Helper function to detect native platform
  private isPlatformNative(): boolean {
    return (window as any).Capacitor?.isNativePlatform() || false;
  }

  // Helper function to detect iOS
  private isIOS(): boolean {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }

  getStatusDescription(status: string): string {
    switch(status) {
      case 'Registered': return 'Parcel has been registered';
      case 'In Transit': return 'Parcel is in transit to delivery location';
      case 'Out for Delivery': return 'Parcel is out for delivery to recipient';
      case 'Delivered': return 'Parcel has been delivered successfully';
      default: return `Status updated to: ${status}`;
    }
  }

  ensureTimestamp(timestamp: any): any {
    if (!timestamp) return new Date();
    
    if (timestamp.seconds !== undefined) {
      return timestamp;
    }
    
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    return new Date();
  }
  
  hasDeliverymanEvent(deliverymanName: string): boolean {
    return this.trackingEvents.some(event => 
      event.deliverymanName === deliverymanName
    );
  }
  
  hasEventWithStatus(status: string): boolean {
    return this.trackingEvents.some(event => 
      event.status === status
    );
  }
  
  sortTrackingEvents() {
    this.trackingEvents.sort((a, b) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 
                   (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 
                   (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
      // Reverse the order (newest first)
      return timeB - timeA;
    });
  }

  get sortedTrackingEvents(): TrackingEvent[] {
    if (!this.parcel?.trackingEvents) return [];
    
    return [...this.parcel.trackingEvents].sort((a, b) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 
                   (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 
                   (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
      return timeB - timeA;
    });
  }

  mapTrackingEvents(trackingHistory: any[]): TrackingEvent[] {
    const sortedEvents = [...trackingHistory].sort((a, b) => {
      const timeA = a.timestamp?.seconds || 0;
      const timeB = b.timestamp?.seconds || 0;
      return timeA - timeB;
    });

    return sortedEvents.map(data => {
      let title = data.title || '';
      let description = data.description || this.getStatusDescription(data.status);
      let location = data.location || 'Unknown Location';

      // Map status to friendly titles if not already set
      if (!title) {
        switch(data.status) {
          case 'Registered':
            title = 'Pickup';
            break;
          case 'In Transit':
            title = 'In Transit';
            break;
          case 'Out for Delivery':
            title = 'Out for Delivery';
            break;
          case 'Delivered':
            title = 'Delivered';
            break;
          default:
            title = data.status;
            break;
        }
      }

      return {
        title,
        status: data.status,
        description,
        timestamp: data.timestamp,
        location,
        deliverymanName: data.deliverymanName,
        photoURL: data.photoURL,
        icon: this.getStatusIcon(data.status),
        active: true,
        source: 'tracking_history'
      };
    });
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'Registered': return 'create-outline';
      case 'In Transit': return 'airplane-outline';
      case 'Out for Delivery': return 'bicycle-outline';
      case 'Delivered': return 'checkmark-circle-outline';
      default: return 'information-circle-outline';
    }
  }

  isEventActive(status: string): boolean {
    if (!this.parcel?.status) return false;
    
    const currentStatus = this.parcel.status.toLowerCase();
    
    if (status === 'Registered') return true;
    
    if (status === 'In Transit') {
      return currentStatus === 'in transit' || 
             currentStatus === 'out for delivery' || 
             currentStatus === 'delivered';
    }
    
    if (status === 'Out for Delivery') {
      return currentStatus === 'out for delivery' || 
             currentStatus === 'delivered';
    }
    
    if (status === 'Delivered') {
      return currentStatus === 'delivered';
    }
    
    return false;
  }

  formatDate(date: any): string {
    if (!date) return 'Not available';
    try {
      let dateObj = date instanceof Date ? date : new Date(date.seconds ? date.seconds * 1000 : date);
      return dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });
    } catch (e) {
      return 'Date error';
    }
  }

  async showErrorToast(message: string = 'An error occurred. Please try again.') {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'danger',
      position: 'top'
    });
    toast.present();
  }

  async showInfoToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'medium',
      position: 'top'
    });
    toast.present();
  }

  calculateEstimatedDelivery(parcelData: any) {
    // Return if parcel is already delivered
    if (parcelData.status === 'Delivered') {
      this.estimatedDelivery = null;
      return;
    }
    
    // Get the parcel creation date or current date as fallback
    const creationDate = parcelData.createdAt ? 
      (parcelData.createdAt.toDate ? parcelData.createdAt.toDate() : new Date(parcelData.createdAt)) : 
      new Date();
    
    const currentDate = new Date();
    
    // Company work policies
    const WORKING_DAYS_PER_WEEK = 6; // Monday-Saturday (Sunday rest)
    const WORK_START_HOUR = 10; // 10:00 AM
    const WORK_END_HOUR = 20;   // 8:00 PM
    
    // Vehicle and logistics parameters - ADJUSTED FOR REALISTIC DELIVERY TIMES
    const BASE_SPEED_KM_PER_HOUR = 80; // Increased average speed
    const TRAFFIC_FACTOR = 0.8; // Less traffic reduction (20% instead of 30%)
    const EFFECTIVE_SPEED = BASE_SPEED_KM_PER_HOUR * TRAFFIC_FACTOR; // ~64 km/h effective speed
    
    // REDUCED administrative time factors (in hours)
    const SORTING_TIME = 1; // Reduced from 2 hours
    const LOADING_TIME = 0.5; // Reduced from 1 hour
    const PER_STOP_TIME = 0.15; // Reduced from 0.25 (15 to 9 minutes)
    
    // Calculate distance in kilometers if coordinates are available
    let distanceKm = 0;
    if (this.mapCoordinates) {
      distanceKm = this.calculateDistance(
        this.mapCoordinates.currentLat,
        this.mapCoordinates.currentLng,
        this.mapCoordinates.destLat,
        this.mapCoordinates.destLng
      );
      console.log(`Calculated distance: ${distanceKm.toFixed(2)} km`);
    }
    
    // Estimate number of delivery stops (REDUCED for faster delivery)
    let estimatedStops = 1; // At least one stop for this parcel
    if (distanceKm > 0 && distanceKm < 20) {
      estimatedStops += Math.floor(distanceKm / 10); // Reduced stops (one every 10km instead of 5km)
    } else if (distanceKm >= 20) {
      estimatedStops += 2 + Math.floor((distanceKm - 20) / 20); // Reduced stops (one every 20km instead of 10km)
    }
    
    // Calculate total travel time needed
    let estimatedHours = 0;
    
    if (distanceKm > 0) {
      // Travel time based on distance and effective speed
      const travelHours = distanceKm / EFFECTIVE_SPEED;
      
      // Add administrative time based on distance tier
      if (distanceKm < 50) { // Short distance (within state)
        // 1-day delivery for short distances (same state)
        estimatedHours = travelHours + LOADING_TIME + (PER_STOP_TIME * estimatedStops);
        
      } else if (distanceKm < 150) { // Medium distance (neighboring state)
        // 1-2 day delivery for medium distances (neighboring state)
        estimatedHours = travelHours + SORTING_TIME + LOADING_TIME + (PER_STOP_TIME * estimatedStops);
        
      } else if (distanceKm < 300) { // Longer distance (2-3 states away)
        // 2-3 day delivery
        estimatedHours = travelHours + SORTING_TIME + LOADING_TIME + (PER_STOP_TIME * estimatedStops) + 4;
        
      } else { // Very long distance (across multiple states)
        // 3-4 day delivery for long distances
        estimatedHours = travelHours + SORTING_TIME + LOADING_TIME + (PER_STOP_TIME * estimatedStops) + 8;
      }
    } else {
      // Fallback if no coordinates: estimate based on status
      switch(parcelData.status) {
        case 'Registered':
          estimatedHours = 24; // 1 day if just registered (reduced from 2 days)
          break;
        case 'In Transit':
          estimatedHours = 12; // 0.5 day if in transit (reduced from 1 day)
          break;
        case 'Out for Delivery':
          estimatedHours = 4; // Same day if out for delivery (reduced from 8 hours)
          break;
        default:
          estimatedHours = 24; // Default: 1 day (reduced from 2 days)
      }
    }
  
    console.log(`Initial estimated hours: ${estimatedHours}`);
    
    // Apply time-of-day factor (REDUCED impact)
    const currentHour = currentDate.getHours();
    if (currentHour >= 7 && currentHour <= 9) {
      // Morning rush hour: add 15% more time (reduced from 25%)
      estimatedHours *= 1.15;
      console.log('Applied morning rush hour factor');
    } else if (currentHour >= 17 && currentHour <= 19) {
      // Evening rush hour: add 20% more time (reduced from 30%)
      estimatedHours *= 1.2;
      console.log('Applied evening rush hour factor');
    }
    
    // Apply day-of-week factor (REDUCED impact)
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 5) { // Friday
      // Friday: add 10% more time (reduced from 15%)
      estimatedHours *= 1.1;
      console.log('Applied Friday factor');
    } else if (dayOfWeek === 6) { // Saturday
      // Saturday: add 5% more time (reduced from 10%)
      estimatedHours *= 1.05;
      console.log('Applied Saturday factor');
    }
    
    // Convert hours to working days
    // IMPORTANT CHANGE: Use 24 hours per day instead of just work hours, as parcels move overnight
    let totalWorkingDays = Math.ceil(estimatedHours / 24);
    
    // Add a smaller buffer (0.5 day instead of 1 day)
    totalWorkingDays += 0.5;
    
    // Round up to whole days
    totalWorkingDays = Math.ceil(totalWorkingDays);
    
    console.log(`Estimated working days needed: ${totalWorkingDays}`);
    
    // Calculate the estimated delivery date by accounting for working days
    let estimatedDate = new Date(creationDate);
    let workdaysAdded = 0;
    
    // If the current time is already past work hours, start counting from tomorrow
    if (currentHour >= WORK_END_HOUR) {
      estimatedDate.setDate(estimatedDate.getDate() + 1);
      console.log('Current time is after work hours, starting count from tomorrow');
    }
    
    while (workdaysAdded < totalWorkingDays) {
      // Add one day
      estimatedDate.setDate(estimatedDate.getDate() + 1);
      
      // Skip Sundays (0 = Sunday in JavaScript Date)
      if (estimatedDate.getDay() !== 0) {
        workdaysAdded++;
        console.log(`Added workday: ${estimatedDate.toDateString()}, ${workdaysAdded}/${totalWorkingDays}`);
      } else {
        console.log(`Skipped Sunday: ${estimatedDate.toDateString()}`);
      }
    }
    
    // Rest of your code remains the same...
    
    // Format the date for display
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const formattedDate = `${estimatedDate.getDate()} ${monthNames[estimatedDate.getMonth()]} ${estimatedDate.getFullYear()}`;
    const dayOfWeekName = dayNames[estimatedDate.getDay()];
    
    // Calculate days remaining
    const timeDiff = estimatedDate.getTime() - currentDate.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // Determine estimated delivery time window based on distance and time of day
    let timeWindow = "10 AM - 8 PM"; // Default window matching working hours
    
    if (daysRemaining === 0) {
      // If delivery is today, provide a narrower window based on current time
      if (currentHour < 12) {
        timeWindow = "2 PM - 8 PM"; // Morning now, deliver afternoon/evening
      } else if (currentHour < 16) {
        timeWindow = "5 PM - 8 PM"; // Afternoon now, deliver evening
      } else if (currentHour < WORK_END_HOUR) {
        timeWindow = `${currentHour + 2}:00 PM - 8:00 PM`; // Later delivery window
      }
    } else {
      // For deliveries on future days, estimate time window based on distance
      if (distanceKm < 15) {
        // Very short distance - likely to be delivered early
        timeWindow = "10 AM - 1 PM";
      } else if (distanceKm < 30) {
        // Medium distance - mid-morning to early afternoon
        timeWindow = "11 AM - 3 PM";
      } else if (distanceKm < 60) {
        // Longer distance - afternoon delivery
        timeWindow = "1 PM - 5 PM";
      } else {
        // Very long distance - later in the day
        timeWindow = "3 PM - 8 PM";
      }
    }
    
    // Set the estimated delivery information
    this.estimatedDelivery = {
      date: estimatedDate,
      formattedDate,
      dayOfWeek: dayOfWeekName,
      timeWindow,
      daysRemaining: daysRemaining < 0 ? 0 : daysRemaining
    };
    
    console.log('Final estimated delivery:', this.estimatedDelivery);
  }

  private isSameTimestamp(a: any, b: any): boolean {
    if (!a || !b) return false;
    
    // Convert both to milliseconds for comparison
    let timeA: number;
    let timeB: number;
    
    if (a instanceof Date) {
      timeA = a.getTime();
    } else if (a.seconds) {
      timeA = a.seconds * 1000;
    } else {
      timeA = new Date(a).getTime();
    }
    
    if (b instanceof Date) {
      timeB = b.getTime();
    } else if (b.seconds) {
      timeB = b.seconds * 1000;
    } else {
      timeB = new Date(b).getTime();
    }
    
    // Allow 1 second difference to account for rounding
    return Math.abs(timeA - timeB) < 1000;
  }

  private getStatusTitle(status: string): string {
    switch(status) {
      case 'Registered': return 'Registered';
      case 'In Transit': return 'In Transit';
      case 'Out for Delivery': return 'Out for Delivery';
      case 'Delivered': return 'Delivered';
      case 'Handoff': return 'Parcel Handoff';
      default: return status;
    }
  }

  centerOnCurrentLocation() {
    if (!this.map || !this.mapCoordinates) {
      return;
    }
    
    console.log('Centering map on current deliveryman location');
    
    // Smoothly animate to the current location
    this.map.flyTo(
      [this.mapCoordinates.currentLat, this.mapCoordinates.currentLng],
      15, // Zoom level
      {
        animate: true,
        duration: 1.5 // Animation duration in seconds
      }
    );
    
    // Open popup with current location info
    this.currentLocationMarker.openPopup();
    
    // Add a highlight effect to the marker
    const markerElement = this.currentLocationMarker.getElement();
    if (markerElement) {
      markerElement.style.transition = 'transform 0.3s ease-out';
      markerElement.style.transform = 'scale(1.2)';
      setTimeout(() => {
        markerElement.style.transform = 'scale(1)';
      }, 300);
    }
  }
}