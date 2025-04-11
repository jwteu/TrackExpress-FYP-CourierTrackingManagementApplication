import { Component, OnInit, inject, Injector, runInInjectionContext, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';
import { TrackingHistoryService } from '../../services/tracking-history.service';
import { GeocodingService } from '../../services/geocoding.service';
declare const L: any;

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
export class TrackingParcelPage implements OnInit, AfterViewInit {
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
    
    // Load parcel handlers (deliverymen assigned to this parcel)
    try {
      const handlersSnapshot = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(this.trackingHistoryService.getParcelHandlers(this.trackingId));
      });
      
      if (handlersSnapshot && handlersSnapshot.length > 0) {
        handlersSnapshot.forEach(handler => {
          // Create an event that combines Handler Assigned with current status
          const title = handler.status === 'Out for Delivery' ? 
            'Out for Delivery' : 'Handler Assigned';
          const icon = handler.status === 'Out for Delivery' ? 
            'bicycle-outline' : 'person-outline';
          const description = handler.status === 'Out for Delivery' ? 
            'Parcel is out for delivery to recipient' : 
            'Parcel assigned to delivery personnel';
            
          this.trackingEvents.push({
            title: title,
            status: handler.status,
            description: description, 
            timestamp: handler.assignedAt,
            location: parcelData['locationDescription'] || parcelData['pickupLocation'] || 'Transit Facility',
            deliverymanName: handler.deliverymanName,
            icon: icon,
            active: true,
            source: 'handlers'
          });
        });
      }
    } catch (error) {
      console.error('Error fetching handler history:', error);
    }
    
    // Only add a separate "Out for Delivery" event if there's no handler with that status
    const hasOutForDeliveryHandler = this.trackingEvents.some(
      event => event.status === 'Out for Delivery'
    );
    
    if (parcelData['status'] === 'Out for Delivery' && !hasOutForDeliveryHandler) {
      // Only add this if we don't already have an Out for Delivery event from handlers
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
    } else if (parcelData['status'] === 'Delivered') {
      // Always add the delivered event if the parcel is delivered
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
    
    // 1. Clear early if we don't have what we need
    if (!this.mapCoordinates || !this.mapElement?.nativeElement) {
      console.error('Missing map coordinates or element');
      return;
    }
    
    try {
      const { currentLat, currentLng, destLat, destLng } = this.mapCoordinates;
      
      // 2. Verify Leaflet is loaded
      if (typeof L === 'undefined') {
        console.error('Leaflet library is not loaded');
        // Instead of trying to load it dynamically (which often fails), show an error message
        this.showErrorToast('Map library not loaded. Please refresh the page.');
        return;
      }
      
      console.log('Creating map with these coordinates:', { currentLat, currentLng, destLat, destLng });
      
      // 3. Create a new Leaflet map instance
      if (!this.map) {
        console.log('Creating new Leaflet map instance');
        this.map = L.map(this.mapElement.nativeElement, {
          center: [currentLat, currentLng],
          zoom: 13,
          attributionControl: true,
          zoomControl: true
        });
        
        // 4. Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.map);
      } else {
        // Reset view if map already exists
        this.map.setView([currentLat, currentLng], 13);
        
        // Clear existing markers and lines
        this.map.eachLayer((layer: any) => {
          if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            this.map.removeLayer(layer);
          }
        });
      }
      
      // 5. Add markers with more visible icons
      // Add origin marker (delivery person location)
      L.marker([currentLat, currentLng], {
        icon: L.divIcon({
          html: `
            <div style="font-size: 14px; background: #FFDE59; border-radius: 50%; 
                 box-shadow: 0 2px 8px rgba(0,0,0,0.4); width: 40px; height: 40px; 
                 display: flex; align-items: center; justify-content: center; position: relative;">
              <ion-icon name="bicycle-outline" style="font-size: 24px; color: #333;"></ion-icon>
              <div style="position: absolute; bottom: -20px; white-space: nowrap; 
                   background: rgba(0,0,0,0.7); color: white; padding: 2px 5px; 
                   border-radius: 3px; font-size: 10px;">Current Location</div>
            </div>
          `,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      }).addTo(this.map)
      .bindPopup(`Current Location: ${this.mapCoordinates.currentLocation}`);
      
      // Add destination marker
      L.marker([destLat, destLng], {
        icon: L.divIcon({
          html: `
            <div style="font-size: 14px; background: white; border-radius: 50%; 
                 box-shadow: 0 2px 8px rgba(0,0,0,0.4); width: 40px; height: 40px; 
                 display: flex; align-items: center; justify-content: center; position: relative;">
              <ion-icon name="home-outline" style="font-size: 24px; color: #333;"></ion-icon>
              <div style="position: absolute; bottom: -20px; white-space: nowrap; 
                   background: rgba(0,0,0,0.7); color: white; padding: 2px 5px; 
                   border-radius: 3px; font-size: 10px;">Destination</div>
            </div>
          `,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      }).addTo(this.map)
      .bindPopup(`Destination: ${this.parcel?.receiverAddress || 'Delivery Address'}`);
      
      // 6. Draw a more visible route line between points
      // IMPROVED: Thicker, more visible line with arrow decorations
      const routeCoordinates = [
        [currentLat, currentLng],
        [destLat, destLng]
      ];
      
      // Create a thick, highly visible main line
      const mainRoute = L.polyline(routeCoordinates, {
        color: '#FFDE59', // Bright yellow main color
        weight: 6, // Thicker line
        opacity: 0.9, // More opaque
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);
      
      // Add a darker outline to the route for better visibility
      const routeOutline = L.polyline(routeCoordinates, {
        color: '#333333', // Dark outline
        weight: 10, // Thicker than the main line
        opacity: 0.3, // Semi-transparent
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);
      
      // Make sure outline is behind the main route
      routeOutline.bringToBack();
      mainRoute.bringToFront();
      
      // Add animated arrow decoration along the route
      if (L.polylineDecorator) {
        const decorator = L.polylineDecorator(mainRoute, {
          patterns: [
            {
              offset: '5%',
              repeat: '15%',
              symbol: L.Symbol.arrowHead({
                pixelSize: 12,
                polygon: true,
                pathOptions: {
                  color: '#333',
                  fillOpacity: 0.8,
                  weight: 1
                }
              })
            }
          ]
        }).addTo(this.map);
      }
      
      // 7. Calculate straight-line distance
      const d = this.calculateDistance(currentLat, currentLng, destLat, destLng);
      this.mapCoordinates.distance = d.toFixed(1);
      
      // 8. Make the map fit both points with padding
      this.map.fitBounds(mainRoute.getBounds(), {
        padding: [40, 40],
        maxZoom: 15
      });
      
      // 9. Force a map size recalculation
      setTimeout(() => {
        this.map.invalidateSize();
        this.mapLoaded = true;
      }, 250);
      
    } catch (error) {
      console.error('Error in map initialization:', error);
      this.mapLoaded = true;
      this.showErrorToast('Map could not be displayed. Please try again.');
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

  openExternalMap() {
    if (!this.mapCoordinates) return;
    
    const { destLat, destLng } = this.mapCoordinates;
    const label = encodeURIComponent(this.parcel?.receiverAddress || 'Destination');
    
    let mapUrl = '';
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      mapUrl = `maps://?q=${label}&ll=${destLat},${destLng}`;
    } else {
      mapUrl = `https://www.openstreetmap.org/?mlat=${destLat}&mlon=${destLng}&zoom=15`;
    }
    
    window.open(mapUrl, '_system');
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
      return timeA - timeB;
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
      let title = '';
      let description = data.description || this.getStatusDescription(data.status);
      let location = data.location || 'Unknown Location';

      switch(data.status) {
        case 'Registered':
          title = 'Pickup';
          description = `Parcel registered by admin at ${location}`;
          break;
          
        case 'In Transit':
          if (data.deliverymanName) {
            title = `Handled by ${data.deliverymanName}`;
            description = `Parcel is now being handled by ${data.deliverymanName}`;
          } else {
            title = 'In Transit';
          }
          break;
          
        case 'Out for Delivery':
          title = 'Out for Delivery';
          break;
          
        case 'Delivered':
          title = 'Delivered';
          break;
          
        default:
          title = data.title || data.status;
          break;
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
    
    // Constants for company work policies
    const WORKING_DAYS_PER_WEEK = 6; // Monday-Saturday
    const WORK_HOURS_PER_DAY = 8; // Total work hours per day
    const REST_HOURS = 1; // Rest hours per day
    const EFFECTIVE_HOURS = WORK_HOURS_PER_DAY - REST_HOURS; // Effective delivery hours per day
    const AVG_SPEED_KM_PER_HOUR = 35; // Average speed in km/h

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
    
    // Base estimation in hours based on distance
    let estimatedHours = 0;
    
    if (distanceKm > 0) {
      // Calculate raw travel time based on distance and speed
      const rawTravelHours = distanceKm / AVG_SPEED_KM_PER_HOUR;
      
      // Add processing time based on distance
      if (distanceKm < 10) {
        estimatedHours = rawTravelHours + 2; // Short distance: add 2 hours for processing
      } else if (distanceKm < 50) {
        estimatedHours = rawTravelHours + 4; // Medium distance: add 4 hours
      } else if (distanceKm < 100) {
        estimatedHours = rawTravelHours + 8; // Longer distance: add 8 hours
      } else {
        estimatedHours = rawTravelHours + 16; // Very long distance: add 16 hours
      }
    } else {
      // Fallback if no coordinates: estimate based on status
      switch(parcelData.status) {
        case 'Registered':
          estimatedHours = 48; // 2 days
          break;
        case 'In Transit':
          estimatedHours = 24; // 1 day
          break;
        case 'Out for Delivery':
          estimatedHours = 6; // Same day delivery (6 effective hours)
          break;
        default:
          estimatedHours = 48; // Default to 2 days
      }
    }

    console.log(`Initial estimated hours: ${estimatedHours}`);
    
    // Convert hours to working days, considering our effective work hours per day
    let totalWorkingDays = Math.ceil(estimatedHours / EFFECTIVE_HOURS);
    
    // Add an extra day for safety buffer
    totalWorkingDays += 1;
    
    console.log(`Estimated working days needed: ${totalWorkingDays}`);
    
    // Calculate the estimated delivery date by accounting for working days
    let estimatedDate = new Date(creationDate);
    let workdaysAdded = 0;
    
    while (workdaysAdded < totalWorkingDays) {
      // Add one day
      estimatedDate.setDate(estimatedDate.getDate() + 1);
      
      // Skip Sundays (0 = Sunday in JavaScript Date)
      if (estimatedDate.getDay() !== 0) {
        workdaysAdded++;
      }
    }
    
    // If current time is after working hours (after 5 PM), add one more day
    const currentHour = currentDate.getHours();
    if (currentHour >= 17) { // 5 PM
      estimatedDate.setDate(estimatedDate.getDate() + 1);
      
      // Skip Sunday if needed
      if (estimatedDate.getDay() === 0) {
        estimatedDate.setDate(estimatedDate.getDate() + 1);
      }
    }
    
    // Ensure that if the estimated date has passed but parcel isn't delivered,
    // we set it to the next available working day
    if (estimatedDate < currentDate && parcelData.status !== 'Delivered') {
      // Set to tomorrow or next Monday if tomorrow is Sunday
      estimatedDate = new Date(currentDate);
      estimatedDate.setDate(currentDate.getDate() + 1);
      
      // If it's Sunday, move to Monday
      if (estimatedDate.getDay() === 0) {
        estimatedDate.setDate(estimatedDate.getDate() + 1);
      }
    }
    
    // Format the date for display
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const formattedDate = `${estimatedDate.getDate()} ${monthNames[estimatedDate.getMonth()]} ${estimatedDate.getFullYear()}`;
    const dayOfWeek = dayNames[estimatedDate.getDay()];
    
    // Calculate days remaining
    const timeDiff = estimatedDate.getTime() - currentDate.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // Determine estimated delivery time window based on distance and work hours
    let timeWindow = "9 AM - 5 PM"; // Default window
    
    if (daysRemaining === 0 && distanceKm < 30) {
      // If delivery is today and close by, provide a narrower window
      const currentHour = currentDate.getHours();
      if (currentHour < 12) {
        timeWindow = "1 PM - 5 PM";
      } else {
        timeWindow = "3 PM - 5 PM";
      }
    }
    
    // Set the estimated delivery information
    this.estimatedDelivery = {
      date: estimatedDate,
      formattedDate,
      dayOfWeek,
      timeWindow,
      daysRemaining: daysRemaining < 0 ? 0 : daysRemaining
    };
    
    console.log('Estimated delivery:', this.estimatedDelivery);
  }
}