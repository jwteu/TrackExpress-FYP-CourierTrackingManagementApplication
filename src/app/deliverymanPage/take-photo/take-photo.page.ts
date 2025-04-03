import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom } from 'rxjs';
import { finalize } from 'rxjs/operators';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

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

  constructor(
    private navCtrl: NavController,
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private auth: AngularFireAuth,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
    // Get current user info
    this.auth.authState.subscribe(user => {
      if (user) {
        this.currentUserId = user.uid;
        this.firestore.collection('users').doc(user.uid).get().subscribe(doc => {
          if (doc.exists) {
            const userData = doc.data() as { name?: string };
            this.currentUserName = userData?.name || user.displayName || 'Unknown User';
            
            // Load assigned parcels once we have the user name
            this.loadAssignedParcels();
          }
        });
      } else {
        // Redirect to login if not authenticated
        this.navCtrl.navigateRoot('/login');
      }
    });
  }

  async loadAssignedParcels() {
    if (!this.currentUserName) return;
    
    try {
      this.isLoadingParcels = true;
      
      // Query by name since deliverymanId is not in the database structure
      const assignedParcelsSnapshot = await firstValueFrom(
        this.firestore.collection('assigned_parcels', ref =>
          ref.where('name', '==', this.currentUserName)
        ).valueChanges({ idField: 'id' })
      );
      
      const parcelsWithAddresses: Parcel[] = [];
      
      for (const assignedParcel of assignedParcelsSnapshot as Parcel[]) {
        try {
          // Get the full parcel data to get receiver address
          const parcelQuery = this.firestore.collection('parcels', ref => 
            ref.where('trackingId', '==', assignedParcel.trackingId)
          ).get();
          
          const parcelQuerySnapshot = await firstValueFrom(parcelQuery);
          
          if (!parcelQuerySnapshot.empty) {
            const parcelData = parcelQuerySnapshot.docs[0].data() as any;
            
            // Include all parcels that are in transit or out for delivery
            // We'll handle filtering in the UI if needed
            parcelsWithAddresses.push({
              ...assignedParcel,
              receiverAddress: parcelData.receiverAddress || 'No address available',
              receiverName: parcelData.receiverName,
              status: assignedParcel.status || parcelData.status || 'Pending'
            });
          }
        } catch (error) {
          console.error('Error fetching parcel details:', error);
        }
      }
      
      this.assignedParcels = parcelsWithAddresses;
      this.isLoadingParcels = false;
    } catch (error) {
      console.error('Error loading assigned parcels:', error);
      this.isLoadingParcels = false;
      this.showToast('Failed to load assigned parcels');
    }
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
      // First show a helpful message for web users
      if (!this.isPlatformNative()) {
        await this.alertCtrl.create({
          header: 'Camera Access',
          message: 'Your browser will prompt to access the camera. Select "Allow" and then choose "Camera" from the options.',
          buttons: ['Got it']
        }).then(alert => alert.present());
      }
      
      // Use different options based on platform
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera, // Always try to use Camera directly first
        width: 1000,
        height: 1000,
        correctOrientation: true,
        // These properties help on web
        presentationStyle: 'popover',
        webUseInput: false // Try to use media capture API instead of file input
      });
      
      this.capturedImage = image.dataUrl || null;
      
      if (this.capturedImage) {
        this.capturedImage = await this.resizeImage(this.capturedImage, 1200);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Could not access camera. Please try using the Gallery option instead.');
    }
  }

  isPlatformNative(): boolean {
    // Check for Cordova or Capacitor native runtime
    return typeof (window as any).cordova !== 'undefined' || 
           typeof (window as any).Capacitor !== 'undefined';
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

    try {
      this.isLoading = true;
      const loading = await this.loadingCtrl.create({
        message: 'Uploading verification photo...',
        spinner: 'circles'
      });
      await loading.present();

      try {
        // Optimize image
        const optimizedImage = await this.resizeImage(this.capturedImage, 800); // Smaller size
        
        // Convert data URL to blob
        const response = await fetch(optimizedImage);
        const blob = await response.blob();
        
        const timestamp = new Date().getTime();
        const trackingId = this.selectedParcel.trackingId;
        const filePath = `parcel-photos/${trackingId}_${timestamp}.jpg`;
        
        // Create a reference
        const fileRef = this.storage.ref(filePath);
        
        // Start with simpler metadata
        const uploadTask = this.storage.upload(filePath, blob);
        
        // Wait for upload to complete
        const result = await uploadTask;
        console.log('Upload completed:', result);
        
        // Get download URL
        const downloadURL = await firstValueFrom(fileRef.getDownloadURL());
        console.log('Download URL:', downloadURL);
        
        // Continue with updating Firestore...
        // Update parcel status in Firestore (simplified)
        await this.updateParcelStatus(this.selectedParcel.trackingId, downloadURL);
        
        await loading.dismiss();
        this.showSuccessAlert();
        this.resetForm();
        this.loadAssignedParcels();
        
      } catch (error) {
        console.error('Upload or Firestore error:', error);
        await loading.dismiss();
        this.showToast('Failed to process photo. Please try again.');
      }
    } catch (error) {
      console.error('Error in submit process:', error);
      await this.loadingCtrl.dismiss();
      this.showToast('Failed to process the request');
    } finally {
      this.isLoading = false;
    }
  }

  // Add this helper method to update Firestore
  async updateParcelStatus(trackingId: string, photoURL: string) {
    // First find the parcel
    const parcelRef = this.firestore.collection('parcels')
      .ref.where('trackingId', '==', trackingId);
    
    const parcelSnapshot = await parcelRef.get();
    if (parcelSnapshot.empty) return;
    
    const parcelId = parcelSnapshot.docs[0].id;
    
    // Update main parcels collection
    await this.firestore.collection('parcels').doc(parcelId).update({
      status: 'Delivered',
      photoURL: photoURL,
      photoTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
      deliveryCompletedDate: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Find and update assigned_parcels
    if (this.selectedParcel?.id) {
      await this.firestore.collection('assigned_parcels').doc(this.selectedParcel.id).update({
        status: 'Delivered',
        photoURL: photoURL,
        deliveryCompletedDate: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
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

  // Enhance the success alert
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