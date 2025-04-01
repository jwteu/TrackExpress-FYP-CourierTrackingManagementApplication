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

// Update interface to include receiver address
interface Parcel {
  id?: string;
  trackingId: string;
  name: string;
  locationLat: number;
  locationLng: number;
  addedDate: any;
  receiverAddress?: string; // Added receiver address field
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

    this.isLoading = true;
    console.log('Starting to load parcels for:', this.currentUserName);

    // Query by name since deliverymanId is not in the database structure
    this.firestore.collection('assigned_parcels', ref =>
      ref.where('name', '==', this.currentUserName))
      .valueChanges({ idField: 'id' })
      .subscribe(async assignedParcels => {
        console.log('Loaded assigned parcels:', assignedParcels);
        
        // Create an array to store parcels with receiver address
        const parcelsWithAddresses = [];
        
        // For each assigned parcel, fetch the full parcel data to get receiver address
        for (const assignedParcel of assignedParcels as Parcel[]) {
          try {
            const trackingId = assignedParcel.trackingId;
            console.log(`Fetching receiver address for trackingId: ${trackingId}`);
            
            // Query the main parcels collection to get receiver address
            const parcelQuery = this.firestore.collection('parcels', ref =>
              ref.where('trackingId', '==', trackingId)).get();
            const parcelQuerySnapshot = await firstValueFrom(parcelQuery);
            
            if (!parcelQuerySnapshot.empty) {
              const parcelData = parcelQuerySnapshot.docs[0].data() as any;
              console.log('Found parcel data:', parcelData);
              
              // Debugging: Log all keys in parcelData
              console.log('Keys in parcelData:', Object.keys(parcelData));
              
              // Debugging: Log the value of receiverAddress
              console.log('Value of receiverAddress:', parcelData.receiverAddress);
              
              // Add receiver address to the assigned parcel data
              parcelsWithAddresses.push({
                ...assignedParcel,
                receiverAddress: parcelData.receiverAddress || 'No destination address found'
              });
            } else {
              console.log('No matching parcel found in main collection for:', trackingId);
              // If no matching parcel found, use the original assigned parcel
              parcelsWithAddresses.push({
                ...assignedParcel,
                receiverAddress: 'No destination address found'
              });
            }
          } catch (error) {
            console.error('Error fetching parcel details:', error);
            parcelsWithAddresses.push({
              ...assignedParcel,
              receiverAddress: 'Error fetching address'
            });
          }
        }
        
        console.log('Final parcels with addresses:', parcelsWithAddresses);
        this.parcels = parcelsWithAddresses;
        this.isLoading = false;
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

      // Send email notification to receiver
      try {
        // Fetch parcel data to get receiver information
        const parcelDoc = await firstValueFrom(this.firestore.collection('parcels').doc(parcelDocId).get());
        if (parcelDoc.exists) {
          const parcelData = parcelDoc.data() as any;
          if (parcelData) {
            await this.sendEmailNotifications(parcelData, location.coords.latitude, location.coords.longitude);
          } else {
            console.warn('Parcel data is undefined, cannot send email notification.');
          }
        } else {
          console.warn('Parcel document not found, cannot send email notification.');
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        this.showToast('Parcel added successfully, but failed to send email notification.');
      }

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
        <p>Destination: ${parcel.receiverAddress || 'No address available'}</p>
        <p>Location: ${parcel.locationLat.toFixed(4)}°, ${parcel.locationLng.toFixed(4)}°</p>
      `,
      buttons: ['OK']
    }).then(alert => alert.present());
  }

  // Remove a single parcel (direct delete without using selectedParcels)
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
          handler: async () => {
            try {
              const loading = await this.loadingCtrl.create({
                message: 'Removing parcel...'
              });
              await loading.present();
              
              // Get tracking ID of the parcel
              const docRef = this.firestore.collection('assigned_parcels').doc(parcelId).get();
              const doc = await firstValueFrom(docRef);
              
              if (doc.exists) {
                const data = doc.data() as {trackingId?: string};
                if (data?.trackingId) {
                  // Delete from assigned_parcels collection
                  await this.firestore.collection('assigned_parcels').doc(parcelId).delete();
                  
                  // Update status in main parcels collection
                  const parcelRef = this.firestore.collection('parcels', ref => 
                    ref.where('trackingId', '==', data.trackingId)).get();
                  const parcelSnapshot = await firstValueFrom(parcelRef);
                  
                  if (!parcelSnapshot.empty) {
                    const parcelDocId = parcelSnapshot.docs[0].id;
                    await this.firestore.collection('parcels').doc(parcelDocId).update({
                      status: 'Pending',
                      deliverymanId: null,
                      deliverymanName: null
                    });
                  }
                  
                  this.showToast('Parcel removed successfully');
                }
              }
              
              await loading.dismiss();
            } catch (error) {
              console.error('Error removing parcel:', error);
              this.showToast('Failed to remove parcel. Please try again.');
              await this.loadingCtrl.dismiss();
            }
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

  async sendEmailNotifications(parcelData: any, latitude: number, longitude: number) {
    try {
      // Convert GeoPoint to location name using OpenStreetMap Nominatim API
      let deliverymanLocation = 'Location not available';
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?` +
          `format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log('Location data:', data);
          
          if (data.display_name) {
            deliverymanLocation = data.display_name;
          }
        } else {
          console.error('Failed to get address from coordinates');
        }
      } catch (geocoderError) {
        console.error('Geocoder error:', geocoderError);
      }

      // Only send receiver email, skip sender email
      try {
        const receiverParams = {
          service_id: 'service_o0nwz8b',
          template_id: 'template_1yqzf6m',
          user_id: 'ghZzg_nWOdHQY6Krj',
          template_params: {
            tracking_id: parcelData.trackingId,
            date: new Date(parcelData.date).toLocaleDateString(),
            to_name: parcelData.receiverName || 'Customer',
            location_info: deliverymanLocation, // Current location
            to_email: parcelData.receiverEmail,
            from_name: 'TrackExpress',
            reply_to: 'noreply@trackexpress.com'
          }
        };

        console.log('Attempting to send receiver email with params:', JSON.stringify(receiverParams));
        
        const receiverResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(receiverParams)
        });
        
        const receiverResult = await receiverResponse.text();
        console.log('Receiver email result:', receiverResult);
        
        if (!receiverResponse.ok) {
          throw new Error(`Failed to send receiver email: ${receiverResult}`);
        }
      } catch (receiverError) {
        console.error('Receiver email failed:', receiverError);
        throw receiverError;
      }

      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }
}