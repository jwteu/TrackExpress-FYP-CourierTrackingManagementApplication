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

interface Parcel {
  id?: string;
  trackingId: string;
  name: string;
  locationLat: number;
  locationLng: number;
  addedDate: any;
  receiverAddress?: string;
  receiverName?: string;
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
            
            // Only add parcels that don't already have a photo verification
            if (parcelData.status !== 'Photo verification submitted' && 
                parcelData.status !== 'Delivered' && 
                !parcelData.photoURL) {
              parcelsWithAddresses.push({
                ...assignedParcel,
                receiverAddress: parcelData.receiverAddress || 'No address available',
                receiverName: parcelData.receiverName
              });
            }
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

  selectParcel(parcel: Parcel) {
    this.selectedParcel = parcel;
  }

  async takePicture() {
    if (!this.selectedParcel) {
      this.showToast('Please select a parcel first');
      return;
    }
    
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      
      // Add null check here
      this.capturedImage = image.dataUrl || null;
    } catch (error) {
      console.error('Error taking photo:', error);
      this.showToast('Failed to take photo');
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
        message: 'Uploading photo...'
      });
      await loading.present();

      // Check if parcel exists and is assigned to this delivery person
      const parcelRef = this.firestore.collection('parcels', ref => 
        ref.where('trackingId', '==', this.selectedParcel?.trackingId));
      
      const parcelSnapshot = await firstValueFrom(parcelRef.get());
      
      if (parcelSnapshot.empty) {
        await loading.dismiss();
        this.showToast('Parcel not found');
        this.isLoading = false;
        return;
      }

      const parcelData = parcelSnapshot.docs[0].data() as any;
      const parcelId = parcelSnapshot.docs[0].id;

      // Check if parcel is assigned to the current user
      if (parcelData.deliverymanId !== this.currentUserId) {
        await loading.dismiss();
        this.showToast('This parcel is not assigned to you');
        this.isLoading = false;
        return;
      }

      // Upload photo to Firebase Storage
      const timestamp = new Date().getTime();
      const trackingId = this.selectedParcel.trackingId;
      const filePath = `parcel-photos/${trackingId}_${timestamp}.jpg`;
      const fileRef = this.storage.ref(filePath);
      
      // Convert data URL to blob
      const response = await fetch(this.capturedImage);
      const blob = await response.blob();
      
      // Create upload task
      const task = this.storage.upload(filePath, blob);
      
      // Get notified when the upload completes
      task.snapshotChanges().pipe(
        finalize(async () => {
          const downloadURL = await firstValueFrom(fileRef.getDownloadURL());
          
          // Update parcel status and add photo URL
          await this.firestore.collection('parcels').doc(parcelId).update({
            status: 'Photo verification submitted',
            photoURL: downloadURL,
            photoTimestamp: new Date()
          });
          
          await loading.dismiss();
          this.showSuccessAlert();
          this.resetForm();
          this.isLoading = false;
          
          // Reload assigned parcels
          this.loadAssignedParcels();
        })
      ).subscribe();
    } catch (error) {
      console.error('Error uploading photo:', error);
      await this.loadingCtrl.dismiss();
      this.showToast('Failed to upload photo');
      this.isLoading = false;
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
      position: 'bottom'
    });
    toast.present();
  }

  async showSuccessAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Success',
      message: 'Photo uploaded successfully',
      buttons: ['OK']
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