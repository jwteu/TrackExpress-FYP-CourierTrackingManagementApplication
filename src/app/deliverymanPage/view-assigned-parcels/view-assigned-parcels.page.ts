import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
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
import * as Quagga from 'quagga';

// Update interface to include receiver address and status
interface Parcel {
  id?: string;
  trackingId: string;
  name: string;
  locationLat: number;
  locationLng: number;
  addedDate: any;
  receiverAddress?: string; // Added receiver address field
  status?: string; // Added status field
}

@Component({
  selector: 'app-view-assigned-parcels',
  templateUrl: './view-assigned-parcels.page.html',
  styleUrls: ['./view-assigned-parcels.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class ViewAssignedParcelsPage implements OnInit, OnDestroy {
  addParcelForm: FormGroup;
  parcels: Parcel[] = [];
  selectedParcels: string[] = [];
  isLoading = false;
  isSaving = false;
  currentUserId: string | null = null;
  currentUserName: string | null = null;

  // Scanner related properties
  isScannerActive = false;
  @ViewChild('scannerElement') scannerElement!: ElementRef; // Fix the ViewChild error by adding !
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('directFileInput') directFileInput!: ElementRef;

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
      trackingId: ['', [Validators.required]],
      status: ['In Transit', [Validators.required]] // Default to "In Transit"
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

  ngOnDestroy() {
    // Clean up scanner when component is destroyed
    this.stopScanner();
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
              
              // Add receiver address to the assigned parcel data
              parcelsWithAddresses.push({
                ...assignedParcel,
                receiverAddress: parcelData.receiverAddress || 'No destination address found',
                status: assignedParcel.status || parcelData.status || 'Pending' // Use status from either source
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
    const status = this.addParcelForm.value.status || 'In Transit'; // Get selected status

    try {
      this.isLoading = true;
      console.log(`Starting to add parcel with tracking ID: ${trackingId}, status: ${status}`);

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

      // Create new assigned parcel with status
      const newParcel = {
        trackingId: trackingId,
        name: this.currentUserName,
        locationLat: location.coords.latitude,
        locationLng: location.coords.longitude,
        addedDate: new Date(),
        status: status // Include the status
      };
      
      console.log('Attempting to add document with data:', newParcel);

      // Add to assigned_parcels collection
      const docRef = await this.firestore.collection('assigned_parcels').add(newParcel);
      console.log('Document successfully added with ID:', docRef.id);

      // Update parcel status in main parcels collection
      await this.firestore.collection('parcels').doc(parcelDocId).update({
        status: status, // Use the selected status
        deliverymanId: this.currentUserId,
        deliverymanName: this.currentUserName
      });

      this.addParcelForm.reset({
        status: 'In Transit' // Reset to default status
      });
      this.showToast('Parcel added successfully');

      // Send email notification to receiver with the status included
      try {
        // Fetch parcel data to get receiver information
        const parcelDoc = await firstValueFrom(this.firestore.collection('parcels').doc(parcelDocId).get());
        if (parcelDoc.exists) {
          const parcelData = parcelDoc.data() as any;
          if (parcelData) {
            await this.sendEmailNotifications(parcelData, location.coords.latitude, location.coords.longitude, status);
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

  async sendEmailNotifications(parcelData: any, latitude: number, longitude: number, status: string) {
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
            parcel_status: status, // Include the status
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

  // Add this new method for direct assignment
  async addParcelWithoutValidation(trackingId: string, status: string): Promise<void> {
    if (!this.currentUserName || !trackingId) {
      this.showToast('Missing required information to assign parcel');
      return Promise.reject('Missing information');
    }

    try {
      console.log(`Auto-assigning parcel with tracking ID: ${trackingId}, status: ${status}`);

      // Check if parcel exists in the database
      const parcelQuery = this.firestore.collection('parcels', ref =>
        ref.where('trackingId', '==', trackingId)).get();
      const parcelQuerySnapshot = await firstValueFrom(parcelQuery);

      if (parcelQuerySnapshot.empty) {
        this.showToast(`Parcel with tracking ID ${trackingId} does not exist in the system`);
        return Promise.reject('Parcel not found');
      }

      // Check if already assigned
      const assignedQuery = this.firestore.collection('assigned_parcels', ref =>
        ref.where('trackingId', '==', trackingId)).get();
      const assignedQuerySnapshot = await firstValueFrom(assignedQuery);

      if (!assignedQuerySnapshot.empty) {
        this.showToast(`Parcel ${trackingId} is already assigned`);
        return Promise.reject('Already assigned');
      }

      // Get current location
      const location = await this.getCurrentLocation();

      if (!location) {
        this.showToast('Unable to get current location. Please enable location services and try again.');
        return Promise.reject('Location error');
      }

      const parcelDocId = parcelQuerySnapshot.docs[0].id;
      
      // Create new assigned parcel with status
      const newParcel = {
        trackingId: trackingId,
        name: this.currentUserName,
        locationLat: location.coords.latitude,
        locationLng: location.coords.longitude,
        addedDate: new Date(),
        status: status
      };

      // Add to assigned_parcels collection
      const docRef = await this.firestore.collection('assigned_parcels').add(newParcel);
      
      // Update parcel status in main parcels collection
      await this.firestore.collection('parcels').doc(parcelDocId).update({
        status: status,
        deliverymanId: this.currentUserId,
        deliverymanName: this.currentUserName
      });

      // Reset the form to default status
      this.addParcelForm.patchValue({
        trackingId: '',
        status: 'In Transit'
      });
      
      this.showToast(`Parcel ${trackingId} assigned successfully`);

      // Send email notification
      try {
        // Fetch parcel data to get receiver information
        const parcelDoc = await firstValueFrom(this.firestore.collection('parcels').doc(parcelDocId).get());
        if (parcelDoc.exists) {
          const parcelData = parcelDoc.data() as any;
          if (parcelData) {
            await this.sendEmailNotifications(parcelData, location.coords.latitude, location.coords.longitude, status);
          }
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't reject the promise, email sending is secondary
      }

      return Promise.resolve();
      
    } catch (error) {
      console.error('Error auto-assigning parcel:', error);
      this.showToast('Failed to assign parcel. Please try again.');
      return Promise.reject(error);
    }
  }

  // Optimize scanner specifically for TrackExpress barcode format
  async startScanner() {
    this.isScannerActive = true;
    
    setTimeout(() => {
      try {
        Quagga.init({
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: this.scannerElement.nativeElement,
            constraints: {
              width: { min: 1280, ideal: 1920, max: 2560 }, // Higher resolution
              height: { min: 720, ideal: 1080, max: 1440 }, // Higher resolution
              facingMode: "environment", // Use back camera
              aspectRatio: { min: 1, max: 2 }
            },
          },
          locator: {
            patchSize: "medium",
            halfSample: false, // Disable half sampling for higher accuracy
          },
          numOfWorkers: 4, // Use more workers for better processing
          frequency: 10, // Process every 10th frame for better performance
          decoder: {
            readers: ["code_128_reader"], // Only use CODE128 for TrackExpress format
            multiple: false, // Only look for one barcode at a time
          },
          locate: true,
          debug: {
            drawBoundingBox: true,
            showFrequency: true,
            drawScanline: true,
            showPattern: true
          }
        }, (err: any) => {
          if (err) {
            console.error("Error initializing Quagga:", err);
            this.showToast("Failed to initialize scanner. Please check camera permissions.");
            this.stopScanner();
            return;
          }
          
          // Start scanning
          Quagga.start();
          
          // Listen for barcode detection
          Quagga.onDetected(async (result: any) => {
            if (result && result.codeResult && result.codeResult.code) {
              const code = result.codeResult.code;
              
              // Validate that this is a TrackExpress barcode (starts with TR followed by 8 chars)
              if (code.startsWith('TR') && code.length === 10) {
                console.log("TrackExpress barcode detected:", code);
                
                // Stop scanner immediately to prevent multiple scans
                this.stopScanner();
                
                // Process the detected barcode
                await this.handleDetectedBarcode(code);
              } else {
                // Not our format, continue scanning
                console.log("Non-TrackExpress barcode detected:", code);
                // Optionally show a toast for invalid format
                // this.showToast("Invalid barcode format. Please scan a TrackExpress barcode.");
              }
            }
          });
        });
      } catch (error) {
        console.error('Error starting scanner:', error);
        this.showToast('Failed to start barcode scanner');
        this.stopScanner();
      }
    }, 300);
  }

  // Stop barcode scanner
  stopScanner() {
    try {
      if (Quagga) {
        Quagga.stop();
      }
    } catch (e) {
      console.log('No scanner to stop');
    }
    
    this.isScannerActive = false;
  }

  // Process uploaded images
  async processUploadedImage(event: any, closeScanner: boolean = false) {
    const files = event.target.files;
    if (!files || !files.length) return;

    const file = files[0];
    
    try {
      // Show loading
      const loading = await this.loadingCtrl.create({
        message: 'Processing image...',
        duration: 30000 // Set a maximum duration for the loading spinner (30 seconds)
      });
      await loading.present();

      // Read the file as a data URL with a Promise wrapper for better error handling
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
      
      // Create an image element and load the image
      const image = new Image();
      
      // Process the image once loaded
      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          // Create a canvas for image processing
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Optimize image size for processing - resize large images
          const maxDimension = 1000; // Maximum width/height
          let width = image.width;
          let height = image.height;
          
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
          
          // Set canvas dimensions and draw the image
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(image, 0, 0, width, height);
          
          // Process with Quagga
          Quagga.decodeSingle({
            decoder: {
              readers: [
                "code_128_reader", 
                "ean_reader", 
                "ean_8_reader", 
                "code_39_reader", 
                "code_93_reader", 
                "upc_reader", 
                "upc_e_reader", 
                "codabar_reader", 
                "i2of5_reader"
              ]
            },
            locate: true,
            src: canvas.toDataURL('image/png')
          }, (result: any) => {
            if (result && result.codeResult) {
              const code = result.codeResult.code;
              console.log('Barcode detected from image:', code);
              
              // Reset file inputs
              if (this.fileInput) this.fileInput.nativeElement.value = '';
              if (this.directFileInput) this.directFileInput.nativeElement.value = '';
              
              // Close scanner if needed
              if (closeScanner || this.isScannerActive) {
                this.stopScanner();
              }
              
              resolve();
              
              // We'll handle the parcel assignment outside this Promise
              setTimeout(() => {
                loading.dismiss();
                this.handleDetectedBarcode(code);
              }, 100);
            } else {
              reject(new Error('No barcode detected'));
            }
          });
        };
        
        image.onerror = () => reject(new Error('Failed to load image'));
        image.src = imageUrl;
      }).catch(error => {
        console.error('Error in image processing:', error);
        throw error; // Propagate to the outer catch
      });
      
    } catch (error) {
      console.error('Error processing image:', error);
      
      // Make sure loading is dismissed in case of error
      try {
        await this.loadingCtrl.dismiss();
      } catch (e) {
        // Ignore errors from dismiss (it might already be dismissed)
      }
      
      // Show clear error message
      let errorMessage = 'Failed to process image';
      if (error instanceof Error) {
        if (error.message.includes('No barcode detected')) {
          errorMessage = 'No valid barcode detected in the image. Please try another image or use camera scanning.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      this.showToast(errorMessage);
    }
  }

  // Enhanced method to handle detected barcodes
  async handleDetectedBarcode(code: string) {
    // Verify this is a valid TrackExpress format again
    if (!code.startsWith('TR') || code.length !== 10) {
      this.showToast("Invalid barcode format. Please scan a TrackExpress barcode.");
      return;
    }

    // Play a success sound (optional)
    this.playSuccessBeep();
    
    // Show a different loading indicator for assignment
    const assigningLoading = await this.loadingCtrl.create({
      message: `Assigning parcel ${code}...`,
      duration: 10000 // 10 second timeout
    });
    await assigningLoading.present();
    
    try {
      // First update the form with the detected code
      this.addParcelForm.patchValue({
        trackingId: code,
        status: this.addParcelForm.value.status || 'In Transit' // Keep selected status if present
      });
      
      // Try to automatically add the parcel
      await this.addParcelWithoutValidation(code, this.addParcelForm.value.status || 'In Transit');
      this.showToast(`Successfully assigned parcel: ${code}`);
      
      // Refresh the parcels list
      this.loadParcels();
    } catch (error) {
      console.error('Error assigning parcel:', error);
      
      // Show specific error message based on the error
      if (error === 'Parcel not found') {
        this.showToast(`Parcel with tracking ID ${code} does not exist in the system`);
      } else if (error === 'Already assigned') {
        this.showToast(`Parcel ${code} is already assigned to a courier`);
      } else if (error === 'Location error') {
        this.showToast('Could not determine your location. Please enable location services.');
      } else {
        this.showToast('Failed to assign parcel. Please try again or enter manually.');
      }
    } finally {
      // Always dismiss the loading spinner
      try {
        await assigningLoading.dismiss();
      } catch (e) {
        // Ignore if already dismissed
      }
    }
  }

  // Optional: Add a success beep sound for feedback
  playSuccessBeep() {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log('Audio feedback not supported');
    }
  }
}