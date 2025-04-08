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
  timestamp: any; // Firebase timestamp or date
  location?: string;
  deliverymanName?: string;
  icon?: string;
  active?: boolean;
}

@Component({
  selector: 'app-tracking-parcel',
  templateUrl: './tracking-parcel.page.html',
  styleUrls: ['./tracking-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class TrackingParcelPage implements OnInit {
  trackingId: string = '';
  parcel: any = null;
  loading: boolean = false;
  searchPerformed: boolean = false;
  trackingEvents: TrackingEvent[] = [];
  
  // Use field injection like in ParcelService and view-assigned-parcels
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
      // Use runInInjectionContext for consistency with ParcelService
      await runInInjectionContext(this.injector, async () => {
        // Query the main parcels collection
        const parcelSnapshot = await firstValueFrom(
          this.firestore.collection('parcels', ref =>
            ref.where('trackingId', '==', this.trackingId.trim())
          ).get()
        );

        if (!parcelSnapshot.empty) {
          const doc = parcelSnapshot.docs[0];
          const parcelData = { id: doc.id, ...(doc.data() as Record<string, any>) };

          // Get tracking history using the service
          this.trackingHistoryService.getTrackingHistory(this.trackingId.trim()).subscribe(
            (trackingHistory: any[]) => {
              // Convert history docs to tracking events
              const trackingEvents: TrackingEvent[] = trackingHistory.map(data => {
                return {
                  title: data.title || this.getStatusTitle(data.status),
                  status: data.status,
                  description: data.description || this.getStatusDescription(data.status),
                  timestamp: data.timestamp,
                  location: data.location,
                  deliverymanName: data.deliverymanName,
                  icon: data.icon || this.getStatusIcon(data.status),
                  active: data.active !== false
                };
              });

              // Ensure we have at least basic events even if no history exists
              if (trackingEvents.length === 0) {
                this.generateDefaultEvents(parcelData);
              } else {
                this.trackingEvents = trackingEvents;
              }

              // Attach tracking events to parcel data
              this.parcel = {
                ...parcelData,
                trackingEvents: this.trackingEvents
              };

              console.log('Parcel with tracking history:', this.parcel);
            },
            (error) => {
              console.error('Error getting tracking history:', error);
              this.showErrorToast();
              this.parcel = null;
              loading.dismiss();
              this.loading = false;
            },
            () => {
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

  // Keep all the existing methods unchanged
  generateDefaultEvents(parcelData: any) {
    this.trackingEvents = [];
    
    // Always add registration event
    this.trackingEvents.push({
      title: 'Parcel Registered',
      status: 'Registered',
      description: `Parcel registered at ${parcelData.pickupLocation || 'origin facility'}`,
      timestamp: parcelData.createdAt || parcelData.date || new Date(),
      location: parcelData.pickupLocation,
      icon: 'create-outline',
      active: true
    });
    
    // Add subsequent events based on current status
    if (parcelData.status) {
      const status = parcelData.status;
      
      if (status === 'In Transit' || status === 'Out for Delivery' || status === 'Delivered') {
        this.trackingEvents.push({
          title: 'In Transit',
          status: 'In Transit',
          description: 'Parcel is in transit to delivery location',
          timestamp: parcelData.transitDate || parcelData.updatedAt || new Date(),
          deliverymanName: parcelData.deliverymanName,
          icon: 'airplane-outline',
          active: true
        });
      }
      
      if (status === 'Out for Delivery' || status === 'Delivered') {
        this.trackingEvents.push({
          title: 'Out for Delivery',
          status: 'Out for Delivery',
          description: 'Parcel is out for delivery to recipient',
          timestamp: parcelData.outForDeliveryDate || parcelData.updatedAt || new Date(),
          deliverymanName: parcelData.deliverymanName,
          icon: 'bicycle-outline',
          active: true
        });
      }
      
      if (status === 'Delivered') {
        this.trackingEvents.push({
          title: 'Delivered',
          status: 'Delivered',
          description: 'Parcel has been delivered successfully',
          timestamp: parcelData.deliveryCompletedDate || parcelData.updatedAt || new Date(),
          deliverymanName: parcelData.deliverymanName,
          icon: 'checkmark-circle-outline',
          active: true
        });
      }
    }
  }

  // Keep other helper methods (getStatusTitle, getStatusDescription, getStatusIcon, etc.)
  getStatusTitle(status: string): string {
    switch(status) {
      case 'Registered': return 'Parcel Registered';
      case 'In Transit': return 'In Transit';
      case 'Out for Delivery': return 'Out for Delivery';
      case 'Delivered': return 'Delivered';
      default: return status;
    }
  }
  
  getStatusDescription(status: string): string {
    switch(status) {
      case 'Registered': return 'Parcel has been registered';
      case 'In Transit': return 'Parcel is in transit to delivery location';
      case 'Out for Delivery': return 'Parcel is out for delivery to recipient';
      case 'Delivered': return 'Parcel has been delivered successfully';
      default: return `Parcel status: ${status}`;
    }
  }
  
  getStatusIcon(status: string): string {
    switch(status) {
      case 'Registered': return 'create-outline';
      case 'In Transit': return 'airplane-outline';
      case 'Out for Delivery': return 'bicycle-outline';
      case 'Delivered': return 'checkmark-circle-outline';
      default: return 'information-circle-outline';
    }
  }
  
  // Check if event exists in tracking history
  hasTrackingEvent(status: string): boolean {
    if (this.parcel?.trackingEvents) {
      return this.parcel.trackingEvents.some((event: TrackingEvent) => event.status === status);
    }
    
    // Fallback to checking parcel status directly
    if (status === 'In Transit') {
      return this.parcel?.status === 'In Transit' || 
             this.parcel?.status === 'Out for Delivery' || 
             this.parcel?.status === 'Delivered';
    } else if (status === 'Out for Delivery') {
      return this.parcel?.status === 'Out for Delivery' || 
             this.parcel?.status === 'Delivered';
    } else if (status === 'Delivered') {
      return this.parcel?.status === 'Delivered';
    }
    
    return false;
  }
  
  // Check if event is active (current or past)
  isEventActive(status: string): boolean {
    if (this.parcel?.trackingEvents) {
      const event = this.parcel.trackingEvents.find((e: TrackingEvent) => e.status === status);
      return event?.active !== false;
    }
    
    // Fallback to checking parcel status directly
    if (status === 'In Transit') {
      return this.parcel?.status === 'In Transit' || 
             this.parcel?.status === 'Out for Delivery' || 
             this.parcel?.status === 'Delivered';
    } else if (status === 'Out for Delivery') {
      return this.parcel?.status === 'Out for Delivery' || 
             this.parcel?.status === 'Delivered';
    } else if (status === 'Delivered') {
      return this.parcel?.status === 'Delivered';
    }
    
    return true; // Default to active
  }
  
  // Get formatted date for a specific event
  getEventDate(status: string): string {
    if (this.parcel?.trackingEvents) {
      const event = this.parcel.trackingEvents.find((e: TrackingEvent) => e.status === status);
      if (event) {
        return this.formatDate(event.timestamp);
      }
    }
    
    // Fallback to parcel dates
    if (status === 'In Transit' && this.parcel?.transitDate) {
      return this.formatDate(this.parcel.transitDate);
    } else if (status === 'Out for Delivery' && this.parcel?.outForDeliveryDate) {
      return this.formatDate(this.parcel.outForDeliveryDate);
    } else if (status === 'Delivered' && this.parcel?.deliveryCompletedDate) {
      return this.formatDate(this.parcel.deliveryCompletedDate);
    }
    
    return this.formatDate(this.parcel?.updatedAt || new Date());
  }
  
  // Get CSS class for status badge
  getStatusClass(status?: string): string {
    if (!status) return 'pending';
    
    status = status.toLowerCase();
    if (status.includes('transit')) return 'in-transit';
    if (status.includes('out for delivery')) return 'out-for-delivery';
    if (status.includes('delivered')) return 'delivered';
    return 'pending';
  }

  // Format dates consistently 
  formatDate(date: any): string {
    if (!date) return 'Not available';
    
    try {
      let dateObj: Date;
      
      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else if (typeof date === 'object') {
        if (date.seconds !== undefined) {
          dateObj = new Date(date.seconds * 1000);
        } else if (date.toDate && typeof date.toDate === 'function') {
          dateObj = date.toDate();
        } else if (date.getTime && typeof date.getTime === 'function') {
          dateObj = date;
        } else {
          dateObj = new Date(date);
        }
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) {
        return 'Invalid date';
      }
      
      return dateObj.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });
    } catch (e) {
      console.error('Error formatting date:', e);
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

  viewParcelDetails(parcelId: string) {
    this.router.navigate(['/parcel-detail', parcelId]);
  }
}