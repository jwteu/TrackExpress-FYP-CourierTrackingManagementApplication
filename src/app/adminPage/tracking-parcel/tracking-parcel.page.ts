import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';
import { TrackingHistoryService } from '../../services/tracking-history.service';

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
  // Add other properties as needed
}

@Component({
  selector: 'app-tracking-parcel',
  templateUrl: './tracking-parcel.page.html',
  styleUrls: ['./tracking-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class TrackingParcelPage implements OnInit {
  // Component properties remain unchanged
  trackingId: string = '';
  parcel: any = null;
  loading: boolean = false;
  searchPerformed: boolean = false;
  trackingEvents: TrackingEvent[] = [];

  private firestore = inject(AngularFirestore);
  private router = inject(Router);
  private toastController = inject(ToastController);
  private loadingController = inject(LoadingController);
  private trackingHistoryService = inject(TrackingHistoryService);
  private injector = inject(Injector);

  constructor() {}

  ngOnInit() {}

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
        // First get the main parcel data from parcels collection
        const parcelSnapshot = await firstValueFrom(
          this.firestore.collection('parcels', ref =>
            ref.where('trackingId', '==', this.trackingId.trim())
          ).get()
        );

        if (!parcelSnapshot.empty) {
          const doc = parcelSnapshot.docs[0];
          const parcelData = { id: doc.id, ...(doc.data() as Record<string, any>) };

          // Then get tracking history from tracking_history collection
          this.trackingHistoryService.getTrackingHistory(this.trackingId.trim()).subscribe(
            async (trackingHistory: any[]) => {
              // If we have tracking history
              if (trackingHistory && trackingHistory.length > 0) {
                this.trackingEvents = this.mapTrackingEvents(trackingHistory);
              } else {
                // If no tracking history, try to build from different sources
                await this.buildTrackingEvents(parcelData);
              }

              this.parcel = {
                ...parcelData,
                trackingEvents: this.trackingEvents
              };

              console.log('Parcel with tracking history:', this.parcel);
              loading.dismiss();
              this.loading = false;
            },
            (error) => {
              console.error('Error getting tracking history:', error);
              this.showErrorToast();
              this.parcel = null;
              loading.dismiss();
              this.loading = false;
            }
          );
        } else {
          this.parcel = null;
          loading.dismiss();
          this.loading = false;
        }
      });
    } catch (error) {
      console.error('Error searching for parcel:', error);
      this.showErrorToast();
      this.parcel = null;
      loading.dismiss();
      this.loading = false;
    }
  }

  // Enhanced method to build tracking events from multiple sources
  async buildTrackingEvents(parcelData: any) {
    this.trackingEvents = [];
    
    // 1. ALWAYS start with Pickup event from parcels collection (admin data)
    console.log('Adding pickup event from parcels collection');
    this.trackingEvents.push({
      title: 'Pickup',
      status: 'Registered',
      description: `Parcel registered at ${parcelData.pickupLocation || 'origin'}`,
      timestamp: parcelData.createdAt || parcelData.date || new Date(),
      location: parcelData.pickupLocation || 'Origin Facility',
      icon: 'create-outline',
      active: true,
      source: 'parcels'
    });
    
    // 2. Get ALL assigned_parcels records for this tracking ID
    try {
      console.log('Fetching assigned_parcels history for:', this.trackingId);
      const assignedSnapshot = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(
          this.firestore.collection('assigned_parcels', ref =>
            ref.where('trackingId', '==', this.trackingId)
          ).get()
        );
      });
      
      if (!assignedSnapshot.empty) {
        console.log(`Found ${assignedSnapshot.docs.length} assigned_parcels records`);
        
        // Manually sort the results in memory
        const sortedDocs = assignedSnapshot.docs.sort((a, b) => {
          const aData = a.data() as AssignedParcelData;
          const bData = b.data() as AssignedParcelData;
          const dateA = aData.addedDate?.seconds || 0;
          const dateB = bData.addedDate?.seconds || 0;
          return dateA - dateB; // ascending order
        });
        
        // Process EACH assigned_parcels record
        for (const doc of sortedDocs) {
          const assignedData = doc.data() as any;
          console.log('Processing assigned parcel data:', assignedData);
          
          // Prepare location string from coordinates
          let locationStr = 'Transit Hub';
          if (assignedData.locationLat !== undefined && assignedData.locationLng !== undefined) {
            locationStr = `${assignedData.locationLat.toFixed(6)}, ${assignedData.locationLng.toFixed(6)}`;
            
            // Try to get a readable address if available
            if (assignedData.currentLocation) {
              locationStr = assignedData.currentLocation;
            }
          }
          
          // Add an In Transit event for each deliveryman who handled the parcel
          this.trackingEvents.push({
            title: assignedData.name ? `Handled by ${assignedData.name}` : 'In Transit',
            status: 'In Transit',
            description: assignedData.name ? 
              `Parcel assigned to ${assignedData.name}` : 
              'Parcel is being transported',
            // Make sure timestamp is properly converted
            timestamp: this.ensureTimestamp(assignedData.addedDate),
            location: locationStr,
            deliverymanName: assignedData.name,
            icon: 'airplane-outline',
            active: true,
            source: 'assigned_parcels'
          });
          
          console.log('Added tracking event for deliveryman:', assignedData.name);
        }
      } else {
        console.log('No assigned_parcels records found for tracking ID:', this.trackingId);
      }
    } catch (error) {
      console.error('Error fetching assigned parcels history:', error);
    }
    
    // 3. Add delivery status events (Out for Delivery, Delivered)
    console.log('Adding status-based events');
    this.addStatusBasedEvents(parcelData);
    
    // 4. Sort all events chronologically (oldest first) for proper ordering
    console.log('Sorting all events chronologically');
    this.sortTrackingEvents();
  }

  // Add this helper method to ensure timestamps are properly handled
  ensureTimestamp(timestamp: any): any {
    if (!timestamp) return new Date();
    
    // If it's a Firebase timestamp with seconds
    if (timestamp.seconds !== undefined) {
      return timestamp;
    }
    
    // If it's a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // If it's a string or number, convert to Date
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    // Default fallback
    return new Date();
  }
  
  // Helper to add additional events based on current parcel status
  addStatusBasedEvents(parcelData: any) {
    if (!parcelData.status) return;
    
    const status = parcelData.status;
    
    // Add Out for Delivery if needed
    if ((status === 'Out for Delivery' || status === 'Delivered') &&
        !this.hasEventWithStatus('Out for Delivery')) {
      
      this.trackingEvents.push({
        title: 'Out for Delivery',
        status: 'Out for Delivery',
        description: 'Parcel is out for delivery',
        timestamp: parcelData.outForDeliveryDate || parcelData.updatedAt || new Date(),
        location: parcelData.receiverAddress || 'Delivery Area',
        deliverymanName: parcelData.deliverymanName,
        icon: 'bicycle-outline',
        active: true,
        source: 'parcels'
      });
    }
    
    // Add Delivered if needed
    if (status === 'Delivered' && !this.hasEventWithStatus('Delivered')) {
      this.trackingEvents.push({
        title: 'Delivered',
        status: 'Delivered',
        description: 'Parcel Delivered Successfully',
        timestamp: parcelData.deliveryCompletedDate || parcelData.updatedAt || new Date(),
        location: parcelData.receiverAddress || 'Destination',
        deliverymanName: parcelData.deliverymanName,
        photoURL: parcelData.photoURL,
        icon: 'checkmark-circle-outline',
        active: true,
        source: 'parcels'
      });
    }
  }
  
  // Helper methods remain unchanged
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
  
  // But keep internal sorting chronological (oldest first)
  sortTrackingEvents() {
    this.trackingEvents.sort((a, b) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 
                   (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 
                   (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
      return timeA - timeB; // OLDEST FIRST for internal ordering
    });
  }

  // Getter for the view to display newest events at the top
  get sortedTrackingEvents(): TrackingEvent[] {
    if (!this.parcel?.trackingEvents) return [];
    
    // Return a new array sorted in reverse chronological order (newest first for display)
    return [...this.parcel.trackingEvents].sort((a, b) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds : 
                   (a.timestamp instanceof Date ? a.timestamp.getTime() / 1000 : 0);
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds : 
                   (b.timestamp instanceof Date ? b.timestamp.getTime() / 1000 : 0);
      return timeB - timeA; // NEWEST FIRST for display
    });
  }

  // The rest of the code remains unchanged
  mapTrackingEvents(trackingHistory: any[]): TrackingEvent[] {
    // First ensure events are sorted chronologically
    const sortedEvents = [...trackingHistory].sort((a, b) => {
      const timeA = a.timestamp?.seconds || 0;
      const timeB = b.timestamp?.seconds || 0;
      return timeA - timeB;
    });

    return sortedEvents.map(data => {
      let title = '';
      let description = data.description || this.getStatusDescription(data.status);
      let location = data.location || 'Unknown Location';

      // Handle different event types with their specific data sources
      switch(data.status) {
        case 'Registered':
          // Pickup data should be from admin adding parcel
          title = 'Pickup';
          description = `Parcel registered by admin at ${location}`;
          break;
          
        case 'In Transit':
          // This should be from deliveryman assigning the parcel to themselves
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

  getStatusDescription(status: string): string {
    switch (status) {
      case 'Registered': return 'Parcel registered at origin';
      case 'In Transit': return 'Parcel is being transported';
      case 'Out for Delivery': return 'Parcel is out for delivery';
      case 'Delivered': return 'Parcel delivered successfully';
      default: return `Parcel status: ${status}`;
    }
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
    const currentStatus = this.parcel.status;
    if (status === 'Registered') return true;
    if (status === 'In Transit') return currentStatus === 'In Transit' || currentStatus === 'Out for Delivery' || currentStatus === 'Delivered';
    if (status === 'Out for Delivery') return currentStatus === 'Out for Delivery' || currentStatus === 'Delivered';
    if (status === 'Delivered') return currentStatus === 'Delivered';
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

  async showErrorToast() {
    const toast = await this.toastController.create({
      message: 'An error occurred while searching. Please try again.',
      duration: 3000,
      color: 'danger',
      position: 'top'
    });
    toast.present();
  }
}