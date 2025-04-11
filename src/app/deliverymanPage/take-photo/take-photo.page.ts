import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom, from } from 'rxjs';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { CloudinaryService } from '../../services/cloudinary.service';
import { ParcelService } from '../../services/parcel.service';

interface Parcel {
  id?: string;
  trackingId: string;
  name: string;
  locationLat: number;
  locationLng: number;
  addedDate: any;
  receiverAddress?: string;
  receiverName?: string;
  status?: string;
}

@Component({
  selector: 'app-take-photo',
  templateUrl: './take-photo.page.html',
  styleUrls: ['./take-photo.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class TakePhotoPage implements OnInit {
  capturedImage: string | null = null;
  isLoading: boolean = false;
  currentUserId: string | null = null;
  currentUserName: string | null = null;
  assignedParcels: Parcel[] = [];
  selectedParcel: Parcel | null = null;
  isLoadingParcels: boolean = false;

  // Angular 19 injection pattern - keep field injection
  private navCtrl = inject(NavController);
  private firestore = inject(AngularFirestore);
  private auth = inject(AngularFireAuth);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private injector = inject(Injector);
  private cloudinaryService = inject(CloudinaryService);
  private parcelService = inject(ParcelService);

  constructor() { }

  ngOnInit() {
    // Check local storage first to determine if session is valid
    const sessionData = localStorage.getItem('userSession');
    
    if (sessionData) {
      try {
        const userSession = JSON.parse(sessionData);
        
        // Verify role to prevent unauthorized access
        if (userSession.role !== 'deliveryman') {
          console.error('Invalid role for this page');
          this.handleInvalidSession('Invalid user role');
          return;
        }
        
        // Set session data from local storage first (faster load)
        this.currentUserId = userSession.uid;
        this.currentUserName = userSession.name;
        
        // Load parcels immediately using session data
        this.loadAssignedParcels();
      } catch (error) {
        console.error('Error parsing session data:', error);
      }
    }

    // Subscribe to auth state at the top level for double verification
    this.auth.authState.subscribe(user => {
      if (user) {
        if (this.currentUserId !== user.uid) {
          // If the user ID from Firebase doesn't match our session, reset everything
          console.warn('User ID mismatch between session and Firebase auth');
          this.handleInvalidSession('User identity mismatch');
          return;
        }
        
        // Get user data to verify further
        this.getUserData(user.uid);
      } else {
        this.handleInvalidSession('No authenticated user');
      }
    });
  }

  ionViewWillEnter() {
    // Refresh data when the page becomes visible
    if (this.currentUserId && this.currentUserName) {
      this.loadAssignedParcels();
    }
  }

  private async getUserData(userId: string) {
    try {
      const userData = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(this.parcelService.getUserByID(userId));
      });
      
      if (!userData || userData.role !== 'deliveryman') {
        this.handleInvalidSession('Invalid user data');
        return;
      }
      
      if (this.currentUserName !== userData.name) {
        console.warn('Username mismatch between session and database');
        this.currentUserName = userData.name;
        
        // Update session storage
        this.updateSessionData(userData);
        
        // Refresh parcels with new username
        this.loadAssignedParcels();
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }

  private handleInvalidSession(reason: string) {
    console.error('Session invalid:', reason);
    this.showToast('Session error. Please login again.');
    
    localStorage.removeItem('userSession');
    
    // Force logout and redirect to login page
    this.auth.signOut().then(() => {
      this.navCtrl.navigateRoot('/login');
    });
  }

  private updateSessionData(userData: any) {
    try {
      const sessionData = {
        uid: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        lastVerified: new Date().toISOString()
      };
      
      localStorage.setItem('userSession', JSON.stringify(sessionData));
    } catch (error) {
      console.error('Error updating session data:', error);
    }
  }

  loadAssignedParcels() {
    if (!this.currentUserName || !this.currentUserId) {
      this.showToast('Session data missing. Please go back and try again.');
      return;
    }
    
    this.isLoadingParcels = true;
    
    // Use runInInjectionContext for all operations
    runInInjectionContext(this.injector, () => {
      // Use the secure method that requires both name AND ID
      this.parcelService.getAssignedParcelsSecure(
        this.currentUserName!, 
        this.currentUserId!
      ).subscribe({
        next: async (assignedParcelsSnapshot) => {
          // Process the parcels as before
          console.log('Received assigned parcels:', assignedParcelsSnapshot);
          const parcelsWithDetails: Parcel[] = [];
          
          for (const parcel of assignedParcelsSnapshot) {
            // Skip processing if the userId doesn't match (extra security)
            if (parcel.userId && parcel.userId !== this.currentUserId) {
              console.warn('Skipping parcel due to user ID mismatch');
              continue;
            }
            
            try {
              const details = await firstValueFrom(
                this.parcelService.getParcelDetails(parcel.trackingId)
              );
              
              if (details) {
                parcelsWithDetails.push({
                  ...parcel,
                  receiverAddress: details.receiverAddress || 'No address available',
                  receiverName: details.receiverName || 'Unknown',
                  status: parcel.status || details.status
                });
              }
            } catch (error) {
              console.error('Error fetching parcel details:', error);
            }
          }
          
          this.assignedParcels = parcelsWithDetails;
          this.isLoadingParcels = false;
        },
        error: (error) => {
          console.error('Error loading assigned parcels:', error);
          this.isLoadingParcels = false;
          this.showToast('Failed to load assigned parcels');
        }
      });
    });
  }

  // Update the selectParcel method to ensure proper UI state
  selectParcel(parcel: Parcel) {
    // If the same parcel is clicked again, deselect it
    if (this.selectedParcel && this.selectedParcel.id === parcel.id) {
      this.selectedParcel = null;
      this.capturedImage = null; // Reset the image when deselecting
    } else {
      // Select a different parcel
      this.selectedParcel = parcel;
      this.capturedImage = null; // Reset the image when switching parcels
    }
  }

  getStatusClass(status: string | undefined): string {
    if (!status) return 'pending';
    
    status = status.toLowerCase();
    if (status.includes('transit')) return 'in-transit';
    if (status.includes('out for delivery')) return 'out-for-delivery';
    if (status.includes('delivered') || status.includes('photo')) return 'delivered';
    return 'pending';
  }

  async takePicture() {
    if (!this.selectedParcel) {
      this.showToast('Please select a parcel first');
      return;
    }
    
    try {
      // Use Photos source for more reliable behavior in PWA/browser environments
      const source = this.isPlatformNative() ? CameraSource.Camera : CameraSource.Photos;
      
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: source,
        correctOrientation: true
      });
      
      this.capturedImage = image.dataUrl || null;
      
      if (this.capturedImage) {
        this.capturedImage = await this.resizeImage(this.capturedImage, 1200);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Could not access camera. You may need to grant camera permissions.');
    }
  }

  isPlatformNative(): boolean {
    return (window as any).Capacitor?.isNativePlatform() || false;
  }

  async resizeImage(dataUrl: string, maxWidth: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // If image is already smaller, keep original
        if (width <= maxWidth) {
          resolve(dataUrl);
          return;
        }
        
        // Calculate new dimensions
        const ratio = width / height;
        width = maxWidth;
        height = Math.round(width / ratio);
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl); // Fall back to original if context creation fails
          return;
        }
        
        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to DataURL with reduced quality
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(resizedDataUrl);
      };
      
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = dataUrl;
    });
  }

  async uploadFromGallery() {
    if (!this.selectedParcel) {
      this.showToast('Please select a parcel first');
      return;
    }
    
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        width: 1200, // Limit image size for better upload performance
        correctOrientation: true
      });
      
      this.capturedImage = image.dataUrl || null;
    } catch (error) {
      console.error('Error selecting photo from gallery:', error);
      this.showToast('Failed to select photo from gallery');
    }
  }

  async submit() {
    if (!this.selectedParcel || !this.capturedImage) {
      this.showToast('Please select a parcel and take a photo');
      return;
    }

    let loading: HTMLIonLoadingElement | null = null;

    try {
      this.isLoading = true;
      
      // Create loading with better accessibility options
      loading = await this.loadingCtrl.create({
        message: 'Uploading verification photo...',
        spinner: 'circles',
        backdropDismiss: false,
        cssClass: 'accessibility-loading',
        keyboardClose: false
      });
      
      await loading.present();
      console.log('Starting upload process...');

      // Use runInInjectionContext for the entire submit operation
      await runInInjectionContext(this.injector, async () => {
        try {
          // Optimize image
          console.log('Resizing image...');
          const optimizedImage = await this.resizeImage(this.capturedImage!, 800);
          const response = await fetch(optimizedImage);
          const blob = await response.blob();
          
          const timestamp = new Date().getTime();
          const trackingId = this.selectedParcel!.trackingId;
          const fileName = `${trackingId}_${timestamp}`;
          
          console.log('Uploading to Cloudinary...');
          // Upload to Cloudinary using the service
          const uploadResult = await firstValueFrom(
            this.cloudinaryService.uploadImage(blob, fileName)
          );
          
          console.log('Cloudinary upload complete. URL:', uploadResult.secure_url);
          const downloadURL = uploadResult.secure_url;
          
          // Update parcel status
          console.log('Updating parcel status...');
          await this.updateParcelStatus(trackingId, downloadURL);
          console.log('Parcel status updated successfully');
          
          // Show success
          this.showSuccessAlert();
          this.resetForm();
          
          // Reload parcels list
          this.loadAssignedParcels();
        } catch (innerError) {
          console.error('Error inside injection context:', innerError);
          throw innerError; // Re-throw to be caught by outer try/catch
        }
      });
    } catch (error) {
      console.error('Process error:', error);
      this.showToast('Failed to upload photo. Please try again.');
    } finally {
      // Always ensure loading is dismissed and state is reset
      if (loading) {
        try {
          await loading.dismiss();
        } catch (dismissError) {
          console.log('Error dismissing loader:', dismissError);
        }
      }
      
      this.isLoading = false;
      console.log('Upload process completed (success or failure)');
    }
  }

  // Update parcel status method
  async updateParcelStatus(trackingId: string, photoURL: string) {
    return runInInjectionContext(this.injector, async () => {
      try {
        console.log('Getting parcel details for:', trackingId);
        
        // First get the parcel details using ParcelService
        const parcelDetails = await firstValueFrom(
          this.parcelService.getParcelDetails(trackingId)
        );
        
        if (!parcelDetails) {
          throw new Error('Parcel not found');
        }
        
        console.log('Retrieved parcel details:', parcelDetails.id);
        
        // Update the parcel status using ParcelService
        await firstValueFrom(
          this.parcelService.updateParcelWithTracking(
            parcelDetails.id,
            {
              status: 'Delivered',
              photoURL: photoURL,
              photoTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
              deliveryCompletedDate: firebase.firestore.FieldValue.serverTimestamp()
            },
            {
              status: 'Delivered',
              description: 'Parcel has been delivered successfully',
              location: this.selectedParcel?.receiverAddress || '',
              deliverymanName: this.currentUserName || '',
              photoURL: photoURL
            }
          )
        );
        
        console.log('Main parcel updated successfully');
        
        // If the parcel is in assigned_parcels, update it there as well
        if (this.selectedParcel?.id) {
          console.log('Updating assigned parcel record');
          await firstValueFrom(
            from(this.firestore.collection('assigned_parcels').doc(this.selectedParcel.id).update({
              status: 'Delivered',
              photoURL: photoURL,
              deliveryCompletedDate: firebase.firestore.FieldValue.serverTimestamp()
            }))
          );
          console.log('Assigned parcel record updated');
        }
        
        console.log('All status updates completed successfully');
      } catch (error) {
        console.error('Error updating parcel status:', error);
        throw error;
      }
    });
  }

  resetForm() {
    this.selectedParcel = null;
    this.capturedImage = null;
  }

  async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 2000,
      position: 'bottom',
      color: 'dark'
    });
    toast.present();
  }

  async showSuccessAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Delivery Verified',
      cssClass: 'success-alert',
      message: `
        <div class="success-animation">
          <ion-icon name="checkmark-circle-outline"></ion-icon>
        </div>
        <div class="success-message">
          <h2>Photo verification uploaded!</h2>
          <p>The parcel status has been updated to "Delivered" and the verification photo has been saved.</p>
        </div>
      `,
      buttons: [{
        text: 'Done',
        cssClass: 'success-button'
      }]
    });
    await alert.present();
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    
    try {
      // Handle different types of date objects
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
      
      // Check if the date is valid
      if (isNaN(dateObj.getTime())) {
        return 'Invalid date';
      }
      
      // Format as YYYY-MM-DD
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Error';
    }
  }

  goBack() {
    this.navCtrl.navigateBack('/deliveryman-home');
  }
}