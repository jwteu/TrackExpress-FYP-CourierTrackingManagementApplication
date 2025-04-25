import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { IonicModule, NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';
import { switchMap, catchError, tap, delay } from 'rxjs/operators';
import * as Quagga from 'quagga';
import firebase from 'firebase/compat/app';
import { RouterModule } from '@angular/router';
import { ParcelService } from '../../services/parcel.service';
import { GeocodingService } from '../../services/geocoding.service';
import { TrackingHistoryService } from '../../services/tracking-history.service';

// Define a complete interface with all properties needed
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
  selected?: boolean;
  userId?: string;
  userEmail?: string;
  locationDescription?: string;
  photoURL?: string;
  completedAt?: any;
  deliverymanName?: string;
  deliverymanId?: string;
}

@Component({
  selector: 'app-view-assigned-parcels',
  templateUrl: './view-assigned-parcels.page.html',
  styleUrls: ['./view-assigned-parcels.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule]
})
export class ViewAssignedParcelsPage implements OnInit, OnDestroy {
  // Add this line to your existing properties
  private injector = inject(Injector);
  
  // State variables
  currentUserId: string | null = null;
  currentUserName: string | null = null;
  assignedParcels: Parcel[] = [];
  isLoadingParcels: boolean = false;
  isAddingParcel: boolean = false;
  isScanningBarcode: boolean = false;
  isProcessingImage: boolean = false;
  isMultiSelectMode: boolean = false;
  allSelected: boolean = false;
  
  // Form
  parcelForm: FormGroup;
  
  // Scanner references
  @ViewChild('scanner') scannerElement!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  
  // Subscriptions
  private authSubscription!: Subscription;
  private parcelsSubscription!: Subscription;
  
  // Services
  private navCtrl = inject(NavController);
  private auth = inject(AngularFireAuth);
  private formBuilder = inject(FormBuilder);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private parcelService = inject(ParcelService);
  private geocodingService = inject(GeocodingService);
  private trackingHistoryService = inject(TrackingHistoryService);

  // Add this property to your component
  private sessionCheckInterval: any;

  // Add these properties to the class
  private locationUpdateInterval: any;
  private lastLocationUpdate: Date | null = null;
  private isUpdatingLocation: boolean = false;
  private minimumUpdateDistance: number = 50; // Minimum distance (meters) to trigger update

  constructor() {
    // Initialize form
    this.parcelForm = this.formBuilder.group({
      trackingId: ['', [Validators.required, Validators.minLength(3)]],
      status: ['In Transit', Validators.required]
    });
  }

  ngOnInit() {
    // Clear any existing subscriptions first
    this.clearSubscriptions();
    
    // Reset state variables
    this.resetState();
    
    // Check local storage first to determine if session is valid
    const sessionData = localStorage.getItem('userSession');
    let sessionUserId = null;
    
    if (sessionData) {
      try {
        const userSession = JSON.parse(sessionData);
        sessionUserId = userSession.uid;
        
        // Verify role to prevent unauthorized access
        if (userSession.role !== 'deliveryman') {
          console.error('Invalid role for this page');
          this.handleInvalidSession('Invalid user role');
          return;
        }
      } catch (error) {
        console.error('Error parsing session data:', error);
      }
    }
    
    this.authSubscription = this.auth.authState.pipe(
      // Add delay to ensure Firebase auth state is fully updated
      delay(300)
    ).subscribe(user => {
      if (user) {
        // Store current user information
        this.currentUserId = user.uid;
        
        // Check if session userId matches Firebase auth userId
        if (sessionUserId && sessionUserId !== user.uid) {
          console.error('User ID mismatch between session and Firebase auth');
          this.handleInvalidSession('User identity mismatch');
          return;
        }
        
        console.log('Current logged-in user ID:', this.currentUserId);
        
        // Get user's name from Firestore with triple verification
        this.getUserName(user.uid).then(userData => {
          if (userData && userData.name) {
            // Verify email, role, and ID match
            if (userData.email === user.email && 
                userData.role === 'deliveryman' && 
                userData.id === user.uid) {
              
              this.currentUserName = userData.name;
              console.log('User verified:', this.currentUserName, user.email);
              
              // Update session data with verified information
              this.updateSessionData(userData);
              
              this.loadAssignedParcels();
            } else {
              console.error('User verification failed. Data mismatch!');
              console.error('Email match:', userData.email === user.email);
              console.error('Role:', userData.role);
              console.error('ID match:', userData.id === user.uid);
              this.handleInvalidSession('User verification failed');
            }
          } else {
            console.warn('User data incomplete or missing');
            this.handleInvalidSession('User data incomplete');
          }
        }).catch(error => {
          console.error('Failed to load user data:', error);
          this.handleInvalidSession('Failed to load user profile');
        });
      } else {
        this.handleInvalidSession('No authenticated user');
      }
    });

    // Start periodic session verification
    this.startSessionVerification();

    // Start location updates
    this.startLocationUpdates();

    // Check device capabilities
    this.checkDeviceCapabilities();
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    this.stopBarcodeScanner();

    // Clear the interval
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }

    // Stop location updates
    this.stopLocationUpdates();
  }

  ionViewWillLeave() {
    // Make sure to stop scanning and hide all overlays when leaving the page
    this.stopBarcodeScanner();
    this.isProcessingImage = false;
    this.isScanningBarcode = false;
  }

  ionViewDidLeave() {
    // Double-check cleanup when the view is fully left
    if (Quagga) {
      try {
        Quagga.stop();
      } catch (e) {
        console.log('Quagga already stopped');
      }
    }
  }

  loadAssignedParcels() {
    if (!this.currentUserName || !this.currentUserId || !this.verifySessionFreshness()) {
      this.handleInvalidSession('Session invalid when loading parcels');
      return;
    }
    
    this.isLoadingParcels = true;
    
    // Unsubscribe from any existing subscription first
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    
    // Pass both name AND ID for verification - both must match
    this.parcelsSubscription = this.parcelService.getAssignedParcelsSecure(
      this.currentUserName, 
      this.currentUserId
    ).subscribe({
      next: async (parcels) => {
        console.log('Received assigned parcels:', parcels);
        const parcelsWithAddresses: Parcel[] = [];
        
        // For each assigned parcel, get additional details and verify ownership
        for (const parcel of parcels) {
          try {
            // Skip parcels that don't belong to this user
            if (parcel.userId && parcel.userId !== this.currentUserId) {
              console.warn(`Skipping parcel ${parcel.trackingId} - user ID mismatch`);
              continue;
            }
            
            // Skip parcels that are already delivered or have a photo (completed)
            if (parcel.status === 'Delivered' || 
                parcel.status?.includes('photo') || 
                parcel.status?.includes('Photo') ||
                (parcel as any).photoURL) {  // Use type assertion to fix the error
              console.log(`Skipping completed parcel ${parcel.trackingId}`);
              continue;
            }
            
            // Get location description
            let locationDescription = "Unknown location";
            if (parcel.locationLat && parcel.locationLng) {
              // Try to get address from coordinates
              try {
                const geoData = await firstValueFrom(
                  this.geocodingService.getAddressFromCoordinates(
                    parcel.locationLat, 
                    parcel.locationLng
                  )
                );
                
                if (geoData && geoData.display_name) {
                  // Extract just the city/area part of the address
                  const addressParts = geoData.display_name.split(',');
                  if (addressParts.length > 2) {
                    // Use just city and region, not the full address
                    locationDescription = addressParts.slice(1, 3).join(', ').trim();
                  } else {
                    locationDescription = geoData.display_name;
                  }
                }
              } catch (geoError) {
                console.warn('Error getting location name:', geoError);
                locationDescription = `Location ${parcel.locationLat.toFixed(2)}, ${parcel.locationLng.toFixed(2)}`;
              }
            }
            
            // Get parcel details from the main collection
            const parcelDetails = await firstValueFrom(
              this.parcelService.getParcelDetails(parcel.trackingId)
            );
              
            if (parcelDetails) {
              parcelsWithAddresses.push({
                ...parcel,
                locationDescription,
                receiverAddress: parcelDetails.receiverAddress || 'No address available',
                receiverName: parcelDetails.receiverName,
                status: parcel.status || parcelDetails.status || 'Pending',
                selected: false
              });
            }
          } catch (error) {
            console.error('Error fetching parcel details:', error);
          }
        }
        
        console.log('Processed parcels with addresses:', parcelsWithAddresses);
        this.assignedParcels = parcelsWithAddresses;
        this.isLoadingParcels = false;
      },
      error: (error) => {
        console.error('Error loading assigned parcels:', error);
        this.isLoadingParcels = false;
        this.showToast('Failed to load assigned parcels');
      }
    });
  }

  getStatusClass(status: string | undefined): string {
    if (!status) return 'pending';
    
    status = status.toLowerCase();
    if (status.includes('transit')) return 'in-transit';
    if (status.includes('out for delivery')) return 'out-for-delivery';
    if (status.includes('delivered') || status.includes('photo')) return 'delivered';
    return 'pending';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    
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
      
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Error';
    }
  }

  formatCoordinate(coord: number): string {
    return coord.toFixed(4);
  }

  toggleMultiSelectMode() {
    this.isMultiSelectMode = !this.isMultiSelectMode;
    
    if (!this.isMultiSelectMode) {
      this.assignedParcels.forEach(parcel => parcel.selected = false);
    }
  }

  toggleSelection(parcel: Parcel) {
    // Always toggle selection regardless of mode
    parcel.selected = !parcel.selected;
    
    // If not in multi-select mode but a parcel was selected, enter multi-select mode
    if (!this.isMultiSelectMode && parcel.selected) {
      this.isMultiSelectMode = true;
    }
    
    // Check if all parcels are selected
    const selectedCount = this.assignedParcels.filter(p => p.selected).length;
    this.allSelected = selectedCount === this.assignedParcels.length;
    
    // If in multi-select mode and no parcels are selected, exit multi-select mode
    if (this.isMultiSelectMode && selectedCount === 0) {
      this.isMultiSelectMode = false;
    }
  }

  toggleAllParcels() {
    // If all are already selected, deselect all
    if (this.allSelected) {
      this.assignedParcels.forEach(parcel => parcel.selected = false);
      this.allSelected = false;
      this.isMultiSelectMode = false;
    } 
    // Otherwise select all
    else {
      this.assignedParcels.forEach(parcel => parcel.selected = true);
      this.allSelected = true;
      this.isMultiSelectMode = true;
    }
  }

  async removeParcel(parcel: Parcel) {
    const alert = await this.alertCtrl.create({
      header: 'Confirm Removal',
      message: `Are you sure you want to remove parcel ${parcel.trackingId}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, 
        {
          text: 'Remove',
          handler: () => {
            this.performParcelRemoval([parcel]);
          }
        }
      ]
    });
    
    await alert.present();
  }

  async removeSelectedParcels() {
    const selectedParcels = this.assignedParcels.filter(p => p.selected);
    
    if (selectedParcels.length === 0) {
      this.showToast('No parcels selected');
      return;
    }
    
    const alert = await this.alertCtrl.create({
      header: 'Confirm Removal',
      message: `Are you sure you want to remove ${selectedParcels.length} parcels?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, 
        {
          text: 'Remove',
          handler: () => {
            this.performParcelRemoval(selectedParcels);
          }
        }
      ]
    });
    
    await alert.present();
  }

  async performParcelRemoval(parcels: Parcel[]) {
    if (parcels.length === 0) return;
    
    const loading = await this.loadingCtrl.create({
      message: 'Removing parcels...'
    });
    
    await loading.present();
    
    try {
      const tasks = parcels.map(parcel => {
        // First get the parcel details
        return this.parcelService.getParcelDetails(parcel.trackingId).pipe(
          switchMap(parcelDetails => {
            if (!parcelDetails) {
              return forkJoin([]);
            }
            
            // Record this handler's data in parcel_handlers collection
            const handlerTask = this.trackingHistoryService.completeParcelHandling(
              parcel.trackingId,
              this.currentUserId || 'unknown'
            );
            
            // Add a tracking event for the handoff
            const trackingTask = this.trackingHistoryService.addTrackingEvent({
              trackingId: parcel.trackingId,
              parcelId: parcelDetails.id,
              status: 'Handoff',
              title: 'Parcel Handoff',
              description: `Parcel handed off by ${this.currentUserName}`,
              timestamp: firebase.firestore.Timestamp.now(),
              location: parcel.locationLat && parcel.locationLng ? 
                `${parcel.locationLat.toFixed(6)}, ${parcel.locationLng.toFixed(6)}` : undefined,
              deliverymanId: this.currentUserId || undefined,
              deliverymanName: this.currentUserName || undefined
            });
            
            const deleteTask = this.parcelService.removeAssignedParcel(parcel.id!);
            const resetTask = this.parcelService.resetParcelStatus(parcelDetails.id);
            
            return forkJoin([deleteTask, resetTask, handlerTask, trackingTask]);
          })
        );
      });
      
      await firstValueFrom(forkJoin(tasks));
      
      await loading.dismiss();
      this.showToast(`${parcels.length} parcel(s) removed successfully`);
      
      // Refresh the list
      this.loadAssignedParcels();
      
      // Exit multi-select mode if we were in it
      if (this.isMultiSelectMode) {
        this.isMultiSelectMode = false;
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error removing parcels:', error);
      this.showToast('Failed to remove parcels');
    }
  }

  async addParcel() {
    // Verify user session is still valid before proceeding
    if (!this.currentUserId || !this.currentUserName || !this.verifySessionFreshness()) {
      this.showToast('Session expired. Please login again.');
      this.handleInvalidSession('Session validation failed during parcel add');
      return;
    }

    if (this.parcelForm.invalid) {
      this.showToast('Please enter a valid tracking ID');
      return;
    }
    
    const trackingId = this.parcelForm.get('trackingId')?.value;
    const status = this.parcelForm.get('status')?.value;
    
    if (!trackingId || !status) {
      this.showToast('Please fill in all required fields');
      return;
    }
    
    const loading = await this.loadingCtrl.create({
      message: 'Adding parcel and getting accurate location...'
    });
    
    await loading.present();
    this.isAddingParcel = true;
    
    try {
      // Check if parcel exists and is not already assigned
      const parcelDetails = await firstValueFrom(
        this.parcelService.getParcelDetails(trackingId)
      );
      
      if (!parcelDetails) {
        await loading.dismiss();
        this.isAddingParcel = false;
        this.showToast('No parcel found with this tracking ID');
        return;
      }
      
      const isAssigned = await firstValueFrom(
        this.parcelService.isParcelAssigned(trackingId)
      );
      
      if (isAssigned) {
        await loading.dismiss();
        this.isAddingParcel = false;
        this.showToast('This parcel is already assigned to a deliveryman');
        return;
      }
      
      // Get current location WITH HIGH ACCURACY
      let position: Position;
      try {
        if (Capacitor.isPluginAvailable('Geolocation')) {
          // Use high accuracy options for better location precision
          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        } else {
          // Try browser geolocation as fallback with high accuracy
          position = await this.getBrowserLocationWithHighAccuracy();
        }
      } catch (locError) {
        console.error('Error getting location:', locError);
        throw new Error('Unable to get your current location. Please check your device GPS settings.');
      }
      
      // Get detailed address from coordinates using zoom level 18 for better precision
      let locationDescription = "Current location";
      let addressData;
      try {
        addressData = await firstValueFrom(
          this.geocodingService.getAddressFromCoordinates(
            position.coords.latitude, 
            position.coords.longitude,
            { zoom: 18 } // Use higher zoom level for more detailed address
          )
        );
        
        if (addressData && addressData.display_name) {
          locationDescription = addressData.display_name;
          console.log('Location description:', locationDescription);
        }
      } catch (geoError) {
        console.warn('Error getting location name:', geoError);
        locationDescription = `Location ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      }
      
      // IMPORTANT: Create a standardized location object to use in both collections
      const locationData = {
        locationLat: position.coords.latitude,
        locationLng: position.coords.longitude,
        locationDescription: locationDescription,
        locationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // IMPORTANT FIX: Preserve original parcel date from parcel details
      const addedDate = parcelDetails.createdAt || firebase.firestore.FieldValue.serverTimestamp();
      
      // Add to assigned parcels with current location
      const assignedParcelData = {
        trackingId,
        name: this.currentUserName,
        userId: this.currentUserId,
        userEmail: (await this.auth.currentUser)?.email || 'unknown',
        sessionId: this.generateSessionId(),
        status,
        addedDate: addedDate,
        ...locationData // Use the standardized location data
      };
      
      console.log('Adding to assigned parcels with standardized location:', assignedParcelData);
      
      // Use firstValueFrom to properly await the Observable
      const assignedId = await firstValueFrom(
        this.parcelService.addAssignedParcel(assignedParcelData)
      );
      
      console.log('Assigned parcel added with ID:', assignedId);
      
      // Record this handler in parcel_handlers collection
      await firstValueFrom(
        this.trackingHistoryService.addParcelHandler({
          trackingId: trackingId,
          parcelId: parcelDetails.id,
          deliverymanId: this.currentUserId || 'unknown',
          deliverymanName: this.currentUserName || 'Unknown Deliveryman',
          status: status,
          assignedAt: firebase.firestore.Timestamp.now()
        })
      );
      
      // Update parcel status with the SAME location data
      await firstValueFrom(
        this.parcelService.updateParcelStatus(parcelDetails.id, {
          status,
          deliverymanId: this.currentUserId,
          deliverymanName: this.currentUserName,
          ...locationData // Use the same standardized location data
        })
      );
      
      // Add tracking history event using the SAME location data for consistency
      await firstValueFrom(
        this.trackingHistoryService.addTrackingEvent({
          trackingId: trackingId,
          parcelId: parcelDetails.id,
          status: status,
          title: status === 'In Transit' ? 'In Transit' : 'Out for Delivery',
          description: `Parcel ${status === 'In Transit' ? 'in transit at' : 'out for delivery from'} ${locationDescription}`,
          location: locationDescription, // Use the same location name
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          deliverymanId: this.currentUserId,
          deliverymanName: this.currentUserName
        })
      );

      // IMPORTANT FIX: Send email notification to receiver
      try {
        if (parcelDetails.receiverEmail) {
          // Send email notification about the status update
          await firstValueFrom(
            this.parcelService.sendEmailNotification(
              parcelDetails.receiverEmail,
              parcelDetails.receiverName || 'Valued Customer',
              trackingId,
              status,
              locationDescription
            )
          );
          console.log('Status update email sent to receiver');
        } else {
          console.log('No receiver email available to send notification');
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't throw the error to prevent the operation from failing
      }
      
      // Reset form
      this.parcelForm.reset({
        trackingId: '',
        status: 'In Transit'
      });
      
      await loading.dismiss();
      this.isAddingParcel = false;
      this.showToast('Parcel added successfully');
      
      // Add a delay before refreshing the list to ensure database consistency
      setTimeout(() => {
        this.loadAssignedParcels();
      }, 1500);
      
    } catch (error: any) {
      await loading.dismiss();
      this.isAddingParcel = false;
      console.error('Error adding parcel:', error);
      this.showToast(`Failed to add parcel: ${error?.message || 'Unknown error'}`);
      
      // Clear tracking ID even on error
      this.parcelForm.patchValue({
        trackingId: ''
      });
    }
  }

  startBarcodeScanner() {
    this.isScanningBarcode = true;

    setTimeout(() => {
      Quagga.init({
        inputStream: {
          name: 'Live',
        type: 'LiveStream',
        target: this.scannerElement.nativeElement,
        constraints: {
          facingMode: 'environment',
          width: { min: 640 },
          height: { min: 480 },
          aspectRatio: { min: 1, max: 2 }
        }
      },
      locator: {
        patchSize: 'medium',
        halfSample: true
      },
      numOfWorkers: 4,
      frequency: 10,
      decoder: {
        readers: ['code_128_reader']
      },
      locate: true
    }, (err) => {
      if (err) {
        console.error('Scanner initialization failed:', err);
        this.showToast('Failed to initialize scanner');
        this.isScanningBarcode = false;
        return;
      }

      Quagga.start();
      console.log('Scanner started successfully');
    });
  }, 800);
}

stopBarcodeScanner() {
  if (Quagga) {
    try {
      Quagga.stop();
    } catch (e) {
      console.log('Error stopping Quagga:', e);
    }
  }
  this.isScanningBarcode = false;
}

uploadBarcode() {
  this.fileInput.nativeElement.click();
}

async processUploadedImage(event: any) {
  const file = event.target.files[0];
  
  if (!file) return;
  
  this.isProcessingImage = true;
  
  try {
    const dataUrl = await this.readFileAsDataURL(file);
    
    // Create a temporary image element to process with Quagga
    const img = new Image();
    img.src = dataUrl;
    
    img.onload = () => {
      // Create a temporary canvas for the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        this.isProcessingImage = false;
        this.showToast('Failed to process the image - canvas context creation failed');
        // Clear the tracking ID even on error
        this.resetFileInput();
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0, img.width, img.height);
      
      // Use Quagga to detect barcodes in the static image
      Quagga.decodeSingle({
        src: dataUrl,
        numOfWorkers: 0,
        inputStream: {
          size: Math.max(img.width, img.height)
        },
        decoder: {
          readers: [
            'code_128_reader',
            'ean_reader',
            'ean_8_reader',
            'code_39_reader',
            'code_93_reader',
            'upc_reader',
            'upc_e_reader'
          ]
        }
      }, (result) => {
        this.isProcessingImage = false;
        
        if (result && result.codeResult) {
          const code = result.codeResult.code;
          
          // Play success sound
          this.playSuccessBeep();
          
          // Set the detected code in the form
          this.parcelForm.patchValue({
            trackingId: code
          });
          
          this.showToast(`Detected barcode: ${code}`);
          
          // Auto-submit if it's a valid code
          if (code.startsWith('TR') && code.length === 10) {
            this.addParcel();
          }
        } else {
          this.showToast('No barcode detected in the image');
          // Clear the tracking ID field on failure too
          this.parcelForm.patchValue({
            trackingId: ''
          });
        }
        
        // Reset the file input
        this.resetFileInput();
      });
    };
    
    img.onerror = () => {
      this.isProcessingImage = false;
      this.showToast('Failed to process the image');
      // Clear the tracking ID on error
      this.resetFileInput();
    };
  } catch (error) {
    this.isProcessingImage = false;
    console.error('Error processing uploaded image:', error);
    this.showToast('Failed to process the image');
    // Clear tracking ID on error
    this.resetFileInput();
  }
}

readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

resetFileInput() {
  if (this.fileInput && this.fileInput.nativeElement) {
    this.fileInput.nativeElement.value = '';
  }
}

playSuccessBeep() {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.type = 'sine';
  oscillator.frequency.value = 1800;
  gainNode.gain.value = 0.5;
  
  oscillator.start();
  
  setTimeout(() => {
    oscillator.stop();
    audioContext.close();
  }, 150);
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

goBack() {
  this.navCtrl.navigateBack('/deliveryman-home');
}

private processDetectedCode(code: string): string {
  if (!code) return '';

  // Clean the code (remove unwanted characters)
  const cleanCode = code.replace(/[^\w\d]/g, '');

  // If it already looks like a TR code, return it
  if (/^TR[A-Z0-9]{8}$/i.test(cleanCode)) {
    return cleanCode.toUpperCase();
  }

  // If it's numeric, convert it to TR format
  if (/^\d+$/.test(cleanCode)) {
    return `TR${cleanCode.substring(0, 8).toUpperCase()}`;
  }

  // Default case: return the cleaned code
  return cleanCode.toUpperCase();
}

// Reset state to avoid data persistence between sessions
private resetState() {
  this.currentUserId = null;
  this.currentUserName = null;
  this.assignedParcels = [];
  this.isLoadingParcels = false;
  this.isAddingParcel = false;
  this.isScanningBarcode = false;
  this.isProcessingImage = false;
  this.isMultiSelectMode = false;
  this.allSelected = false;
  
  // Reset form
  if (this.parcelForm) {
    this.parcelForm.reset({
      trackingId: '',
      status: 'In Transit'
    });
  }
}

// Clear all subscriptions
private clearSubscriptions() {
  if (this.authSubscription) {
    this.authSubscription.unsubscribe();
  }
  if (this.parcelsSubscription) {
    this.parcelsSubscription.unsubscribe();
  }
}

// Handle invalid session
private handleInvalidSession(reason: string) {
  console.error('Session invalid:', reason);
  this.showToast('Session error. Please login again.');
  
  // Force logout and redirect to login page
  this.auth.signOut().then(() => {
    this.navCtrl.navigateRoot('/login');
  });
}

// Get user data with comprehensive verification
private async getUserName(userId: string): Promise<any> {
  try {
    const userData = await firstValueFrom(
      this.parcelService.getUserByID(userId)
    );
    
    if (!userData) {
      console.error('User data not found for ID:', userId);
      return null;
    }
    
    // Triple verification
    // 1. Verify ID matches
    if (userData.id !== userId) {
      console.error('User ID mismatch! Expected:', userId, 'Got:', userData.id);
      throw new Error('User identity verification failed');
    }
    
    // 2. Verify role is deliveryman
    if (userData.role !== 'deliveryman') {
      console.error('User role is not deliveryman:', userData.role);
      throw new Error('User role verification failed');
    }
    
    // 3. Verify account is active
    if (userData.status === 'disabled' || userData.status === 'suspended') {
      console.error('User account is not active:', userData.status);
      throw new Error('User account is not active');
    }
    
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
}

// Update session data with verified information
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

// Add this method to your component
private verifySessionFreshness(): boolean {
  try {
    const sessionData = localStorage.getItem('userSession');
    if (!sessionData) return false;
    
    const userData = JSON.parse(sessionData);
    const lastVerified = new Date(userData.lastVerified || 0);
    const now = new Date();
    
    // Session timeout after 2 hours (adjust as needed)
    const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; 
    
    if (now.getTime() - lastVerified.getTime() > SESSION_TIMEOUT_MS) {
      console.warn('Session has expired due to timeout');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error verifying session freshness:', error);
    return false;
  }
}

// Generate a unique session identifier
private generateSessionId(): string {
  return `${this.currentUserId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Start periodic session verification
private startSessionVerification() {
  // Check session every minute
  this.sessionCheckInterval = setInterval(() => {
    if (!this.verifySessionFreshness()) {
      console.warn('Session verification failed during routine check');
      this.handleInvalidSession('Session timeout');
    }
  }, 60000); // Every minute
}

// Improve the getBrowserLocationWithHighAccuracy method
private async getBrowserLocationWithHighAccuracy(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }

    // Try to get high accuracy GPS location with longer timeout
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        console.warn(`Geolocation error (code ${error.code}): ${error.message}`);
        reject(error);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 20000, // Increase timeout to 20 seconds
        maximumAge: 0    // Don't use cached position
      }
    );
  });
}

// Add these new methods to your component
private startLocationUpdates() {
  // Stop any existing interval first
  this.stopLocationUpdates();

  console.log('Starting location updates every 2 minutes.');
  // Update location every 2 minutes (120 seconds)
  this.locationUpdateInterval = setInterval(async () => {
    console.log('2-minute interval triggered: Updating location.');
    await this.updateCurrentLocation();
  }, 120 * 1000); // 120 seconds * 1000 ms/second

  // Also update immediately when the page loads
  setTimeout(() => this.updateCurrentLocation(), 1000); // Update shortly after init
}

private stopLocationUpdates() {
  if (this.locationUpdateInterval) {
    console.log('Stopping location updates interval.');
    clearInterval(this.locationUpdateInterval);
    this.locationUpdateInterval = null; // Clear the interval ID
  }
}

private async updateCurrentLocation() {
  // Prevent concurrent updates
  if (this.isUpdatingLocation) {
    console.log('Location update already in progress. Skipping.');
    return;
  }

  // Ensure user is logged in and has assigned parcels
  if (!this.currentUserId || !this.currentUserName || this.assignedParcels.length === 0) {
    console.log('Skipping location update: No user or no assigned parcels.');
    return;
  }

  this.isUpdatingLocation = true;
  console.log('Attempting to get current location for update...');

  try {
    // Get current location with high accuracy and increased timeout
    const position = await this.getBrowserLocationWithHighAccuracy();
    const newLat = position.coords.latitude;
    const newLng = position.coords.longitude;
    const accuracy = position.coords.accuracy; // Get accuracy in meters

    console.log(`New location obtained: Lat ${newLat}, Lng ${newLng}, Accuracy: ${accuracy} meters`);

    // Log warning if accuracy is poor
    if (accuracy > 1000) {
      console.warn(`⚠️ Poor location accuracy: ${accuracy} meters. This may be IP-based location, not GPS.`);
    }

    // Get address description for the new location
    let locationDescription = `${newLat.toFixed(4)}, ${newLng.toFixed(4)}`;
    try {
      // Run geocoding service inside injection context
      const addressData = await runInInjectionContext(this.injector, async () => {
        return await firstValueFrom(
          this.geocodingService.getAddressFromCoordinates(newLat, newLng)
        );
      });
      
      if (addressData && addressData.display_name) {
        locationDescription = addressData.display_name;
        console.log(`Resolved address: ${locationDescription}`);
        
        // Check if location description contains unexpected locations
        if (locationDescription.toLowerCase().includes('puchong') && 
            !this.isNearCoordinates(newLat, newLng, 2.91, 101.61, 20)) {
          console.warn(`⚠️ Location mismatch detected! Address shows Puchong but coordinates aren't nearby.`);
          // This could indicate IP-based fallback location
        }
      }
    } catch (geoError) {
      console.warn('Could not get address for coordinates:', geoError);
    }

    // Prepare location data for update
    const locationData = {
      locationLat: newLat,
      locationLng: newLng,
      locationDescription: locationDescription,
      locationAccuracy: accuracy, // Store accuracy value
      locationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Create a local reference to the injector for use in the promises
    const localInjector = this.injector;

    // Update all assigned parcels for this deliveryman in parallel
    const updatePromises = this.assignedParcels.map(parcel => {
      if (parcel.id && typeof parcel.id === 'string') {
        console.log(`Updating location for assigned parcel ID: ${parcel.id}`);
        return runInInjectionContext(localInjector, async () => {
          try {
            return await firstValueFrom(this.parcelService.updateParcelLocation(parcel.id!, locationData));
          } catch (error) {
            console.error(`Error updating location for parcel ${parcel.id}:`, error);
            return Promise.resolve();
          }
        });
      } else {
        console.warn(`Skipping update for parcel without ID: ${parcel.trackingId}`);
        return Promise.resolve();
      }
    });

    await Promise.all(updatePromises);
    this.lastLocationUpdate = new Date();
    console.log(`Successfully updated location for ${updatePromises.length} parcels at ${this.lastLocationUpdate.toLocaleTimeString()}`);

  } catch (error) {
    console.error('Error updating current location:', error);
  } finally {
    this.isUpdatingLocation = false;
    console.log('Location update process finished.');
  }
}

// Add this helper method to determine if coordinates are near each other
private isNearCoordinates(lat1: number, lng1: number, lat2: number, lng2: number, maxDistanceKm: number): boolean {
  const R = 6371; // Earth's radius in km
  const dLat = this.deg2rad(lat2 - lat1);
  const dLng = this.deg2rad(lng2 - lng1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
    Math.sin(dLng/2) * Math.sin(dLng/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c;
  return distance <= maxDistanceKm;
}

private deg2rad(deg: number): number {
  return deg * (Math.PI/180);
}

// Add this method
async promptForManualLocationCorrection(detectedLocation: string) {
  const alert = await this.alertCtrl.create({
    header: 'Location Confirmation',
    message: `Detected location: ${detectedLocation}<br><br>Is this correct?`,
    buttons: [
      {
        text: 'No, Correct It',
        handler: () => {
          this.openLocationPicker();
        }
      },
      {
        text: 'Yes, Use This',
        role: 'cancel'
      }
    ]
  });

  await alert.present();
}

// Add this method to open a modal or page for selecting location
async openLocationPicker() {
  // You could implement a modal with a map for the user to select their location
  // Or simply prompt for a text description of their current location
  const alert = await this.alertCtrl.create({
    header: 'Enter Your Location',
    inputs: [
      {
        name: 'location',
        type: 'text',
        placeholder: 'e.g., UUM Campus, Sintok, Kedah'
      }
    ],
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel'
      },
      {
        text: 'Use This Location',
        handler: async (data) => {
          if (data.location) {
            try {
              // Convert the entered location to coordinates
              const geoData = await firstValueFrom(
                this.geocodingService.getCoordinatesFromAddress(data.location)
              );
              
              if (geoData && geoData.lat && geoData.lon) {
                // Create a position-like object
                const position = {
                  coords: {
                    latitude: parseFloat(geoData.lat),
                    longitude: parseFloat(geoData.lon),
                    accuracy: 100, // Estimate
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                  },
                  timestamp: Date.now()
                };
                
                // Now update with this position
                await this.processAndUpdateLocation(position);
                this.showToast('Location updated manually');
              } else {
                this.showToast('Could not find coordinates for that location');
              }
            } catch (error) {
              console.error('Error with manual location:', error);
              this.showToast('Failed to set manual location');
            }
          }
        }
      }
    ]
  });

  await alert.present();
}

// Modified helper to process location data
private async processAndUpdateLocation(position: any) {
  const newLat = position.coords.latitude;
  const newLng = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  // Rest of your location processing code...
  // [...]
}

// Add this method to your component
private checkDeviceCapabilities() {
  // Check if device orientation is available (good indicator of mobile device with sensors)
  const hasOrientation = 'DeviceOrientationEvent' in window;
  
  // Check if device motion is available (accelerometer)
  const hasMotion = 'DeviceMotionEvent' in window;
  
  // Check if battery API is available (another mobile indicator)
  const hasBattery = 'getBattery' in navigator;
  
  console.log(`Device capabilities - Orientation: ${hasOrientation}, Motion: ${hasMotion}, Battery: ${hasBattery}`);
  
  // If this is likely a desktop, warn user
  if (!hasOrientation && !hasMotion) {
    console.warn('This appears to be a desktop device. Location accuracy may be limited.');
    // You could show a toast to the user
  }
}
}
