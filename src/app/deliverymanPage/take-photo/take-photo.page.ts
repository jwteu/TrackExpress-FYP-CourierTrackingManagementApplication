import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom, from, map } from 'rxjs'; // Add map import here
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
  photoURL?: string;  // Add this property here too
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
    // Minimal initialization only
    console.log('TakePhotoPage initialized');
  }

  ionViewWillEnter() {
    console.log('TakePhotoPage will enter view');
    
    // Only check session when this page is actually being viewed
    const sessionData = localStorage.getItem('userSession');
    
    if (sessionData) {
      try {
        const userData = JSON.parse(sessionData);
        
        // IMPORTANT CHANGE: Don't trigger logout if not a deliveryman, just return
        if (userData.role !== 'deliveryman') {
          console.log('Not a deliveryman role, redirecting to login');
          this.navCtrl.navigateRoot('/login');
          return;
        }
        
        this.currentUserId = userData.uid;
        this.currentUserName = userData.name;
        
        // Now load data only if we have a valid session
        this.loadAssignedParcels();
      } catch (error) {
        console.error('Session data parse error:', error);
        this.navCtrl.navigateRoot('/login');
      }
    } else {
      console.log('No session data found, redirecting to login');
      this.navCtrl.navigateRoot('/login');
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
    
    runInInjectionContext(this.injector, () => {
      this.parcelService.getAssignedParcelsSecure(
        this.currentUserName!, 
        this.currentUserId!
      ).subscribe({
        next: async (assignedParcelsSnapshot) => {
          console.log('Loaded parcels:', assignedParcelsSnapshot.length);
          
          // Create a new enriched parcels array with recipient details
          const enrichedParcels: Parcel[] = [];
          
          // Process each assigned parcel to get additional details
          for (const parcel of assignedParcelsSnapshot) {
            // Skip already delivered parcels
            if (parcel.status === 'Delivered' || 
                parcel.status?.includes('photo')) {
              continue;
            }
            
            try {
              // Get parcel details from the main collection
              const parcelDetails = await firstValueFrom(
                this.parcelService.getParcelDetails(parcel.trackingId)
              );
              
              if (parcelDetails) {
                enrichedParcels.push({
                  ...parcel,
                  receiverAddress: parcelDetails.receiverAddress || 'No address available',
                  receiverName: parcelDetails.receiverName || 'No recipient name',
                  status: parcel.status || parcelDetails.status || 'Pending'
                });
              } else {
                // If we can't find details, still include the parcel with fallbacks
                enrichedParcels.push({
                  ...parcel,
                  receiverAddress: 'No address available',
                  receiverName: 'No recipient name'
                });
              }
            } catch (error) {
              console.error('Error fetching parcel details:', error);
            }
          }
          
          this.assignedParcels = enrichedParcels;
          console.log('Enriched parcels with recipient details:', this.assignedParcels.length);
          this.isLoadingParcels = false;
        },
        error: (error) => {
          console.error('Error loading parcels:', error);
          this.isLoadingParcels = false;
          this.showToast('Failed to load parcels. Please try again.');
        }
      });
    });
  }

  // Example of fields to include in your query
  private getAssignedParcelsSecure(deliverymanName: string, deliverymanId: string) {
    return this.firestore.collection('assigned_parcels', ref => ref
      .where('deliverymanName', '==', deliverymanName)
      .where('deliverymanId', '==', deliverymanId))
      .valueChanges({ idField: 'id' })
      .pipe(map((parcels: any[]) => parcels as Parcel[]));
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
          // Convert data URL to Blob for Cloudinary
          const imageBlob = await this.dataURLtoBlob(this.capturedImage!);
          
          // Create a unique filename based on tracking ID and timestamp
          const filename = `delivery_${this.selectedParcel!.trackingId}_${new Date().getTime()}`;
          
          // Upload to Cloudinary - now inside injection context
          const uploadResult = await firstValueFrom(
            this.cloudinaryService.uploadImage(imageBlob, filename)
          );
          
          console.log('Photo uploaded to Cloudinary:', uploadResult);
          
          if (uploadResult && uploadResult.secure_url) {
            // We don't need to wrap this in runInInjectionContext anymore
            // as updateParcelStatus now handles its own injection context
            await this.updateParcelStatus(
              this.selectedParcel!.trackingId,
              uploadResult.secure_url
            );
            
            console.log('Parcel status updated with photo URL');
            
            // Show success alert instead of toast for better visibility
            if (loading) {
              await loading.dismiss();
              loading = null; // Set to null after dismissing
            }
            this.isLoading = false;
            
            await this.showSuccessAlert();
            
            // Reset the form after success
            this.resetForm();
            
            // Reload assigned parcels to refresh the list
            this.loadAssignedParcels();
          } else {
            throw new Error('Upload completed but no secure URL returned');
          }
        } catch (innerError) {
          console.error('Error in upload process:', innerError);
          throw innerError;
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
          console.error('Error dismissing loading:', dismissError);
        }
      }
      
      this.isLoading = false;
      console.log('Upload process completed (success or failure)');
    }
  }

  // Helper method to convert data URL to Blob
  private dataURLtoBlob(dataURL: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        
        resolve(new Blob([u8arr], { type: mime }));
      } catch (error) {
        reject(error);
      }
    });
  }

  // Update parcel status method
  async updateParcelStatus(trackingId: string, photoURL: string) {
    return new Promise<void>((resolve, reject) => {
      runInInjectionContext(this.injector, async () => {
        try {
          console.log('Getting parcel details for:', trackingId);
          
          // Get parcel details - wrapped in its own injection context
          let parcelDetails;
          try {
            parcelDetails = await runInInjectionContext(this.injector, async () => {
              return await firstValueFrom(
                this.parcelService.getParcelDetails(trackingId)
              );
            });
          } catch (error) {
            console.error('Error fetching parcel details:', error);
            throw error;
          }
          
          if (!parcelDetails) {
            throw new Error(`Parcel with tracking ID ${trackingId} not found`);
          }
          
          console.log('Retrieved parcel details:', parcelDetails.id);
          
          // Update the parcel status in main collection - wrapped in its own injection context
          try {
            await runInInjectionContext(this.injector, async () => {
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
            });
          } catch (error) {
            console.error('Error updating main parcel:', error);
            throw error;
          }
          
          console.log('Main parcel updated successfully');
          
          // If the parcel is in assigned_parcels, update it there as well
          if (this.selectedParcel?.id) {
            try {
              await runInInjectionContext(this.injector, async () => {
                await firstValueFrom(
                  from(this.firestore.collection('assigned_parcels').doc(this.selectedParcel!.id).update({
                    status: 'Delivered',
                    photoURL: photoURL,
                    completedAt: firebase.firestore.FieldValue.serverTimestamp()
                  }))
                );
              });
            } catch (error) {
              console.error('Error updating assigned parcel:', error);
              throw error;
            }
            
            console.log('Assigned parcel record updated successfully');
          }
          
          console.log('All status updates completed successfully');
          resolve();
        } catch (error) {
          console.error('Error updating parcel status:', error);
          reject(error);
        }
      });
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
      header: 'Delivery Confirmed',
      cssClass: 'success-alert',
      message: `
        <div class="success-container">
          <div class="success-icon">
            <ion-icon name="checkmark-circle"></ion-icon>
          </div>
          <div class="success-content">
            <h2>Parcel #${this.selectedParcel?.trackingId} Delivered</h2>
            <p>Delivery has been verified successfully with photo proof. The parcel status has been updated to "Delivered" in the system.</p>
          </div>
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