import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Geolocation } from '@capacitor/geolocation';
import { ToastController, LoadingController, AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom } from 'rxjs';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';

// Update interface to exactly match the database structure
interface Parcel {
  id?: string; // Added by valueChanges({idField: 'id'})
  trackingId: string;
  name: string; // Changed from deliverymanName
  locationLat: number;
  locationLng: number;
  addedDate: any; // Changed to any to handle different date formats
}

@Component({
  selector: 'app-view-assigned-parcels',
  templateUrl: './view-assigned-parcels.page.html',
  styleUrls: ['./view-assigned-parcels.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class ViewAssignedParcelsPage implements OnInit {
  addParcelForm: FormGroup;
  parcels: Parcel[] = [];
  selectedParcels: string[] = [];
  isLoading = false;
  isSaving = false;
  currentUserId: string | null = null;
  currentUserName: string | null = null;

  constructor(
    private fb: FormBuilder,
    private firestore: AngularFirestore,
    private auth: AngularFireAuth,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private navCtrl: NavController
  ) {
    this.addParcelForm = this.fb.group({
      trackingId: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    // Get current user info
    this.auth.authState.subscribe(user => {
      if (user) {
        this.currentUserId = user.uid;
        this.firestore.collection('users').doc(user.uid).get().subscribe(doc => {
          if (doc.exists) {
            const userData = doc.data() as { name?: string };
            this.currentUserName = userData?.name || user.displayName || 'Unknown User';
            this.loadParcels();
          }
        });
      }
    });
  }

  loadParcels() {
    if (!this.currentUserName) return;

    // Query by name since deliverymanId is not in the database structure
    this.firestore.collection('assigned_parcels', ref =>
      ref.where('name', '==', this.currentUserName))
      .valueChanges({ idField: 'id' })
      .subscribe(parcels => {
        console.log('Loaded parcels:', parcels);
        
        // Check the type of the date field in the first parcel using proper type casting
        if (parcels.length > 0) {
          const firstParcel = parcels[0] as any; // Use 'any' for debugging purposes
          console.log('Date type:', typeof firstParcel.addedDate);
          console.log('Date value:', firstParcel.addedDate);
        }
        
        this.parcels = parcels as Parcel[];
      });
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    
    try {
      // First log what we received for debugging
      console.log('Format date received:', date, 'Type:', typeof date);
      
      // Handle different types of date objects
      let dateObj: Date;
      
      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === 'string') {
        dateObj = new Date(date);
      } else if (typeof date === 'object') {
        if (date.seconds !== undefined) {
          // Handle Firestore timestamp object with seconds property
          dateObj = new Date(date.seconds * 1000);
        } else if (date.toDate && typeof date.toDate === 'function') {
          // Handle Firestore Timestamp objects with toDate() method
          dateObj = date.toDate();
        } else if (date.getTime && typeof date.getTime === 'function') {
          // Handle Date objects directly
          dateObj = date;
        } else {
          // Last resort - try to parse as a Date
          dateObj = new Date(date);
        }
      } else {
        // If it's not an object, try to create a date from it anyway
        dateObj = new Date(date);
      }
      
      // Check if the date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn('Invalid date:', date);
        return 'Invalid date';
      }
      
      // Format as YYYY-MM-DD
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (e) {
      console.error('Error formatting date:', e, 'Original value:', date);
      return 'Error';
    }
  }

  async addParcel() {
    if (this.addParcelForm.invalid || !this.currentUserName) return;

    const trackingId = this.addParcelForm.value.trackingId;

    try {
      this.isLoading = true;
      console.log('Starting to add parcel with tracking ID:', trackingId);

      // Check if parcel exists in the database
      const parcelQuery = this.firestore.collection('parcels', ref =>
        ref.where('trackingId', '==', trackingId)).get();
      const parcelQuerySnapshot = await firstValueFrom(parcelQuery);

      if (parcelQuerySnapshot.empty) {
        this.showToast('Parcel with this tracking ID does not exist in the system');
        this.isLoading = false;
        return;
      }

      // Check if already assigned
      const assignedQuery = this.firestore.collection('assigned_parcels', ref =>
        ref.where('trackingId', '==', trackingId)).get();
      const assignedQuerySnapshot = await firstValueFrom(assignedQuery);

      if (!assignedQuerySnapshot.empty) {
        this.showToast('This parcel is already assigned');
        this.isLoading = false;
        return;
      }

      // Get current location
      const location = await this.getCurrentLocation();

      if (!location) {
        this.showToast('Unable to get current location. Please enable location services and try again.');
        this.isLoading = false;
        return;
      }

      const parcelDocId = parcelQuerySnapshot.docs[0].id;
      console.log('Parcel doc ID:', parcelDocId);

      // Create new assigned parcel exactly matching your database structure
      const newParcel = {
        trackingId: trackingId,
        name: this.currentUserName, // Use name instead of deliverymanName
        locationLat: location.coords.latitude,
        locationLng: location.coords.longitude,
        addedDate: new Date() // Changed from firebase.firestore.Timestamp.now() to new Date()
      };
      
      console.log('Attempting to add document with data:', newParcel);

      // Add to assigned_parcels collection
      const docRef = await this.firestore.collection('assigned_parcels').add(newParcel);
      console.log('Document successfully added with ID:', docRef.id);

      // Update parcel status in main parcels collection
      await this.firestore.collection('parcels').doc(parcelDocId).update({
        status: 'Assigned for delivery',
        deliverymanId: this.currentUserId, // Keep these for reference in main collection
        deliverymanName: this.currentUserName
      });

      this.addParcelForm.reset();
      this.showToast('Parcel added successfully');
    } catch (error) {
      console.error('Error adding parcel:', error);
      this.showToast('Failed to add parcel. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async getCurrentLocation() {
    try {
      console.log('Getting current location...');
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });
      console.log('Location obtained:', position);
      return position;
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }

  onParcelSelection(event: any, parcelId: string | undefined) {
    if (!parcelId) return;
    
    if (event.detail.checked) {
      this.selectedParcels.push(parcelId);
    } else {
      this.selectedParcels = this.selectedParcels.filter(id => id !== parcelId);
    }
  }

  // Check if a parcel is selected
  isSelected(parcelId: string | undefined): boolean {
    if (!parcelId) return false;
    return this.selectedParcels.includes(parcelId);
  }

  // Select all parcels
  selectAllParcels() {
    this.selectedParcels = this.parcels
      .filter(parcel => parcel.id !== undefined)
      .map(parcel => parcel.id as string);
  }

  // Deselect all parcels
  deselectAllParcels() {
    this.selectedParcels = [];
  }

  // View parcel details
  viewParcelDetails(parcel: Parcel) {
    this.alertCtrl.create({
      header: `Parcel: ${parcel.trackingId}`,
      message: `
        <p>Assigned to: ${parcel.name}</p>
        <p>Added: ${this.formatDate(parcel.addedDate)}</p>
        <p>Location: ${parcel.locationLat.toFixed(4)}°, ${parcel.locationLng.toFixed(4)}°</p>
      `,
      buttons: ['OK']
    }).then(alert => alert.present());
  }

  // Remove a single parcel
  async removeParcel(parcelId: string | undefined) {
    if (!parcelId) return;
    
    const alert = await this.alertCtrl.create({
      header: 'Confirm Removal',
      message: 'Are you sure you want to remove this parcel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          handler: () => {
            this.selectedParcels = [parcelId];
            this.removeSelectedParcels();
          }
        }
      ]
    });
    
    await alert.present();
  }

  async removeSelectedParcels() {
    if (this.selectedParcels.length === 0) return;
    
    const alert = await this.alertCtrl.create({
      header: 'Confirm Removal',
      message: `Are you sure you want to remove ${this.selectedParcels.length} selected parcel(s)?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          handler: async () => {
            try {
              const loading = await this.loadingCtrl.create({
                message: 'Removing parcels...'
              });
              await loading.present();
              
              // Get tracking IDs of selected parcels first
              const trackingIds = [];
              for (const id of this.selectedParcels) {
                const docRef = this.firestore.collection('assigned_parcels').doc(id).get();
                const doc = await firstValueFrom(docRef);
                if (doc.exists) {
                  const data = doc.data() as {trackingId?: string};
                  if (data?.trackingId) {
                    trackingIds.push(data.trackingId);
                  }
                }
              }
              
              // Delete from assigned_parcels collection
              for (const id of this.selectedParcels) {
                await this.firestore.collection('assigned_parcels').doc(id).delete();
              }
              
              // Update status in main parcels collection
              for (const trackingId of trackingIds) {
                const parcelRef = this.firestore.collection('parcels', ref => 
                  ref.where('trackingId', '==', trackingId)).get();
                const parcelSnapshot = await firstValueFrom(parcelRef);
                
                if (!parcelSnapshot.empty) {
                  const parcelDocId = parcelSnapshot.docs[0].id;
                  await this.firestore.collection('parcels').doc(parcelDocId).update({
                    status: 'Pending',
                    deliverymanId: null,
                    deliverymanName: null
                  });
                }
              }
              
              this.selectedParcels = [];
              this.showToast('Parcels removed successfully');
              await loading.dismiss();
            } catch (error) {
              console.error('Error removing parcels:', error);
              this.showToast('Failed to remove parcels. Please try again.');
              await this.loadingCtrl.dismiss();
            }
          }
        }
      ]
    });
    
    await alert.present();
  }

  goBack() {
    this.navCtrl.navigateBack('/deliveryman-home');
  }

  isMultiSelectActive(): boolean {
    return this.selectedParcels.length > 1;
  }
}