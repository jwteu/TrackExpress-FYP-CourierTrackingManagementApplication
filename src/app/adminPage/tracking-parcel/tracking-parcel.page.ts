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
  status?: string; // Add the status property
  // Add other properties as needed
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

        // Start real-time location tracking if the parcel is out for delivery OR in transit
        if (this.parcel.status === 'Out for Delivery' || this.parcel.status === 'In Transit') {
          this.startLocationTracking(this.trackingId);
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
              locationData.locationDescription
            );
          }
        },
        error: (err) => {
          console.error('Error tracking location:', err);
          this.isLocationTracking = false;
        }
      });
  }

  stopLocationTracking() {
    if (this.locationSubscription) {
      console.log('Stopping location tracking');
      this.locationSubscription.unsubscribe();
      this.locationSubscription = null;
      this.isLocationTracking = false;
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
    
    // For "Out for Delivery" status, prioritize the most recent location from tracking events
    if (parcelData.status === 'Out for Delivery' && parcelData.locationLat && parcelData.locationLng) {
      // Use the deliveryman's last known coordinates
      currentLat = parcelData.locationLat;
      currentLng = parcelData.locationLng;
      currentLocation = parcelData.locationDescription || 'Current Delivery Location';
      console.log('Using deliveryman location for Out for Delivery:', currentLocation, currentLat, currentLng);
    } 
    // Try to get current location from tracking events for other statuses
    else if (this.trackingEvents.length > 0) {
      // Get most recent event that might have location data
      const latestEvent = [...this.trackingEvents]
        .filter(e => e.location && e.location !== 'Unknown location' && e.location !== parcelData['receiverAddress'])
        .sort((a, b) => {
          const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 
                      (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
          const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 
                      (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
          return timeB - timeA; // Most recent first
        })[0];
      
      if (latestEvent?.location) {
        currentLocation = latestEvent.location;
        
        try {
          // Try geocoding the location text
          const geoData = await firstValueFrom(
            this.geocodingService.getCoordinatesFromAddress(currentLocation)
          );
          
          if (geoData?.lat && geoData?.lon) {
            currentLat = parseFloat(geoData.lat);
            currentLng = parseFloat(geoData.lon);
            console.log('Using location from tracking events:', currentLocation, currentLat, currentLng);
          }
        } catch (error) {
          console.warn('Could not geocode event location, using fallback');
        }
      }
    }
    
    // Get destination coordinates - always needed
    let destLat = currentLat + 0.02; // Default: slightly offset from current
    let destLng = currentLng + 0.02;
    const receiverAddress = parcelData['receiverAddress'];
    
    if (receiverAddress) {
      try {
        const geoData = await firstValueFrom(
          this.geocodingService.getCoordinatesFromAddress(receiverAddress)
        );
        
        if (geoData?.lat && geoData?.lon) {
          destLat = parseFloat(geoData.lat);
          destLng = parseFloat(geoData.lon);
          console.log('Destination coordinates:', destLat, destLng);
        }
      } catch (error) {
        console.warn('Could not geocode destination, using fallback');
      }
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
    
    // Initialize the map with a delay to ensure DOM is ready
    setTimeout(() => {
      if (this.mapElement && this.mapElement.nativeElement) {
        this.initializeMap();
      }
    }, 300);
  }

  async initializeMap() {
    console.log('Initializing map with coordinates:', this.mapCoordinates);

    if (!this.mapCoordinates || !this.mapElement?.nativeElement) {
      console.error('Missing map coordinates or element');
      return;
    }

    // --- FIX: Destroy previous map instance if it exists ---
    if (this.map) {
      this.map.off();
      this.map.remove();
      this.map = null;
    }
    // Clear the map container's innerHTML to avoid duplicate map errors
    this.mapElement.nativeElement.innerHTML = '';

    // Stop location tracking to prevent updates to destroyed map
    this.stopLocationTracking();

    try {
      const { currentLat, currentLng, destLat, destLng } = this.mapCoordinates;

      // Ensure Leaflet is loaded
      if (typeof L === 'undefined') {
        await this.loadLeafletDynamically();
      }

      // Create new map instance
      this.map = L.map(this.mapElement.nativeElement).setView([currentLat, currentLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(this.map);

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
    } catch (error) {
      console.error('Error in map initialization:', error);
      this.mapLoaded = true;
      this.showErrorToast('Map could not be displayed. Please try again.');
    }
  }

  async drawRouteWithOpenRouteService(startLat: number, startLng: number, endLat: number, endLng: number) {
    try {
      // Remove previous route if exists
      if (this.routeLine) {
        this.map.removeLayer(this.routeLine);
        this.routeLine = null;
      }
      if (this.routeOutline) {
        this.map.removeLayer(this.routeOutline);
        this.routeOutline = null;
      }

      // Call OpenRouteService Directions API
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch route from OpenRouteService');
      const data = await response.json();

      // Decode the polyline geometry
      const coords = data.features[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]]);

      // Draw the main route line
      this.routeLine = L.polyline(coords, {
        color: '#FFDE59',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Draw the outline
      this.routeOutline = L.polyline(coords, {
        color: '#333333',
        weight: 10,
        opacity: 0.3,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      this.routeOutline.bringToBack();
      this.routeLine.bringToFront();

      // Fit map to route
      this.map.fitBounds(this.routeLine.getBounds(), {
        padding: [40, 40],
        maxZoom: 15
      });

      // Optionally, update distance
      if (this.mapCoordinates) {
        const distanceKm = data.features[0].properties.summary.distance / 1000;
        this.mapCoordinates.distance = distanceKm.toFixed(1);
      }
    } catch (error) {
      console.error('Error drawing route:', error);
      // Fallback: draw straight line if routing fails
      if (this.map && this.mapCoordinates) {
        const coords = [
          [this.mapCoordinates.currentLat, this.mapCoordinates.currentLng],
          [this.mapCoordinates.destLat, this.mapCoordinates.destLng]
        ];
        this.routeLine = L.polyline(coords, { color: '#FFDE59', weight: 6 }).addTo(this.map);
        this.routeOutline = L.polyline(coords, { color: '#333333', weight: 10, opacity: 0.3 }).addTo(this.map);
      }
    }
  }

  updateMapWithNewLocation(lat: number, lng: number, locationDescription: string) {
    if (!this.map || !this.currentLocationMarker || !this.mapCoordinates) {
      console.error('Map, marker, or coordinates not initialized');
      return;
    }

    // Update the stored coordinates
    this.mapCoordinates.currentLat = lat;
    this.mapCoordinates.currentLng = lng;
    this.mapCoordinates.currentLocation = locationDescription || 'Current Location';

    // Update the marker position
    this.currentLocationMarker.setLatLng([lat, lng]);
    this.currentLocationMarker.setPopupContent(`Current Location: ${locationDescription}`);

    // --- NEW: Redraw the route using OpenRouteService ---
    this.drawRouteWithOpenRouteService(lat, lng, this.mapCoordinates.destLat, this.mapCoordinates.destLng);

    // Optionally, pan/zoom to fit
    // (fitBounds is called in drawRouteWithOpenRouteService)
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

  openExternalMap() {
    if (!this.mapCoordinates) return;
    const { currentLat, currentLng, destLat, destLng } = this.mapCoordinates;
    // Google Maps navigation URL (works on Android/iOS/web)
    const url = `https://www.google.com/maps/dir/?api=1&origin=${currentLat},${currentLng}&destination=${destLat},${destLng}&travelmode=driving`;
    window.open(url, '_system');
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