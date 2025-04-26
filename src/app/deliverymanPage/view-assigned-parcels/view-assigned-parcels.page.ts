import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject, Injector, runInInjectionContext, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subscription, firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import * as Quagga from 'quagga';
import firebase from 'firebase/compat/app';
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
  // Add these important dependencies
  private injector = inject(Injector);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  
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
  private firestore = inject(AngularFirestore);

  // Session and location tracking
  private sessionCheckInterval: any;
  private locationUpdateInterval: any;
  private lastLocationUpdate: Date | null = null;
  private isUpdatingLocation: boolean = false;
  private minimumUpdateDistance: number = 50; // Minimum distance (meters) to trigger update
  
  // Debug flag to help with troubleshooting
  public debugMode: boolean = false;

  constructor() {
    // Initialize form
    this.parcelForm = this.formBuilder.group({
      trackingId: ['', [Validators.required, Validators.pattern('^TR[A-Z0-9]{8}$')]],
      status: ['In Transit', Validators.required]
    });
  }

  ngOnInit() {
    console.log('ViewAssignedParcelsPage initializing');
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
        
        // Set current user from session to enable immediate operations
        this.currentUserId = userSession.uid;
        this.currentUserName = userSession.name;
      } catch (error) {
        console.error('Error parsing session data:', error);
      }
    }
    
    this.authSubscription = this.auth.authState.subscribe(user => {
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
              
              // Explicitly start location updates now that user is verified
              this.startLocationUpdates();
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
    
    console.log('ViewAssignedParcelsPage destroyed');
  }

  ionViewWillEnter() {
    console.log('ViewAssignedParcelsPage will enter');
    // Restart location updates when view re-enters
    if (this.currentUserId && this.currentUserName) {
      this.startLocationUpdates();
    }
  }

  ionViewDidLeave() {
    console.log('ViewAssignedParcelsPage did leave');
    // Double-check cleanup when the view is left
    this.stopBarcodeScanner();
    this.isProcessingImage = false;
    this.isScanningBarcode = false;
    
    // Stop location updates when leaving the page to conserve resources
    this.stopLocationUpdates();
  }

  loadAssignedParcels() {
    if (!this.currentUserName || !this.currentUserId || !this.verifySessionFreshness()) {
      this.handleInvalidSession('Session invalid when loading parcels');
      return;
    }
    
    console.log('Loading assigned parcels for deliveryman:', this.currentUserName);
    this.isLoadingParcels = true;
    this.cdr.detectChanges(); // Force UI update
    
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
        this.zone.run(async () => {
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
                  parcel.photoURL) {
                console.log(`Skipping completed parcel ${parcel.trackingId}`);
                continue;
              }
              
              // Get location description
              let locationDescription = "Unknown location";
              if (parcel.locationLat && parcel.locationLng) {
                // Try to get address from coordinates
                try {
                  const address = await firstValueFrom(
                    this.geocodingService.getAddressFromCoordinates(parcel.locationLat, parcel.locationLng)
                  );
                  if (address && address.formatted_address) {
                    locationDescription = address.formatted_address;
                  }
                } catch (geoError) {
                  console.warn('Could not get address from coordinates:', geoError);
                  locationDescription = `Location near ${parcel.locationLat.toFixed(4)}, ${parcel.locationLng.toFixed(4)}`;
                }
              }
              
              // Get parcel details from the main collection
              const parcelDetails = await runInInjectionContext(this.injector, () => 
                firstValueFrom(this.parcelService.getParcelDetails(parcel.trackingId))
              );
                
              if (parcelDetails) {
                parcelsWithAddresses.push({
                  ...parcel,
                  locationDescription: parcel.locationDescription || locationDescription,
                  receiverAddress: parcelDetails.receiverAddress || 'No address available',
                  receiverName: parcelDetails.receiverName,
                  status: parcel.status || parcelDetails.status || 'Pending',
                  selected: false
                });
              }
            } catch (error) {
              console.error(`Error fetching details for parcel ${parcel.trackingId}:`, error);
            }
          }
          
          console.log('Processed parcels with addresses:', parcelsWithAddresses);
          this.assignedParcels = parcelsWithAddresses;
          this.isLoadingParcels = false;
          this.cdr.detectChanges(); // Force UI update
          
          // If we loaded parcels but don't have a location update yet, trigger one
          if (parcelsWithAddresses.length > 0 && !this.lastLocationUpdate) {
            console.log('Triggering location update after loading parcels');
            this.updateCurrentLocation();
          }
        });
      },
      error: (error) => {
        console.error('Error loading assigned parcels:', error);
        this.zone.run(() => {
          this.isLoadingParcels = false;
          this.showToast('Failed to load assigned parcels');
          this.cdr.detectChanges(); // Force UI update
        });
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
          dateObj = new Date();
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

  formatCoordinate(coord: number | undefined): string {
    if (coord === undefined || coord === null) return 'N/A';
    return coord.toFixed(4);
  }

  toggleMultiSelectMode() {
    this.isMultiSelectMode = !this.isMultiSelectMode;
    
    if (!this.isMultiSelectMode) {
      this.assignedParcels.forEach(parcel => parcel.selected = false);
    }
    this.cdr.detectChanges();
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
    
    this.cdr.detectChanges();
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
    
    this.cdr.detectChanges();
  }

  async removeParcel(parcel: Parcel) {
    if (!parcel.id) {
      this.showToast('Cannot remove parcel: Missing ID');
      return;
    }
    
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
      for (const parcel of parcels) {
        if (!parcel.id) {
          console.warn(`Skipping removal for parcel ${parcel.trackingId}: Missing ID`);
          continue;
        }
        
        // Use runInInjectionContext for Firebase operations
        await runInInjectionContext(this.injector, async () => {
          // Remove from assigned_parcels
          await this.parcelService.removeAssignedParcel(parcel.id!).toPromise();
          
          // Get main parcel details
          const mainParcel = await this.parcelService.getParcelDetails(parcel.trackingId).toPromise();
          
          if (mainParcel && mainParcel.id) {
            // Reset status in main parcels collection
            await this.parcelService.resetParcelStatus(mainParcel.id).toPromise();
            
            // Add tracking history event
            await this.trackingHistoryService.addTrackingEvent({
              trackingId: parcel.trackingId,
              parcelId: mainParcel.id,
              status: 'Assignment Removed',
              title: 'Removed from Courier',
              description: `Parcel removed from delivery person ${this.currentUserName}`,
              timestamp: new Date(),
              location: parcel.locationDescription || 'Unknown',
              deliverymanId: this.currentUserId ?? undefined,
              deliverymanName: this.currentUserName ?? undefined
            }).toPromise();
          }
        });
      }
      
      loading.dismiss();
      this.showToast(`Successfully removed ${parcels.length} parcel(s)`);
      
      // Reset multi-select mode
      this.isMultiSelectMode = false;
      this.allSelected = false;
      
      // Reload assigned parcels
      this.loadAssignedParcels();
    } catch (error) {
      loading.dismiss();
      console.error('Error removing parcels:', error);
      this.showToast('Failed to remove some parcels');
    }
  }

  async addParcel() {
    // Verify user session is still valid before proceeding
    if (!this.currentUserId || !this.currentUserName || !this.verifySessionFreshness()) {
      this.showToast('Your session is invalid. Please login again.');
      this.handleInvalidSession('Session invalid during add parcel');
      return;
    }

    if (this.parcelForm.invalid) {
      this.showToast('Please enter a valid tracking ID (format: TRXXXXXXXX)');
      return;
    }
    
    const trackingId = this.parcelForm.get('trackingId')?.value.trim().toUpperCase();
    const status = this.parcelForm.get('status')?.value;
    
    if (!trackingId || !status) {
      this.showToast('Please fill out all required fields');
      return;
    }
    
    const loading = await this.loadingCtrl.create({
      message: 'Adding parcel and getting accurate location...'
    });
    
    await loading.present();
    this.isAddingParcel = true;
    
    try {
      // Check if parcel exists first
      const parcelDetails = await runInInjectionContext(this.injector, async () => {
        return await firstValueFrom(this.parcelService.getParcelDetails(trackingId));
      });
      
      if (!parcelDetails) {
        throw new Error(`Parcel with tracking ID ${trackingId} not found`);
      }
      
      // Check if parcel is already assigned to another deliveryman
      const isAssigned = await runInInjectionContext(this.injector, async () => {
        return await firstValueFrom(this.parcelService.isParcelAssigned(trackingId));
      });
      
      if (isAssigned) {
        // Check if it's assigned to the current user
        const alreadyOwned = this.assignedParcels.some(p => p.trackingId === trackingId);
        if (alreadyOwned) {
          this.showToast(`Parcel ${trackingId} is already in your list`);
          loading.dismiss();
          this.isAddingParcel = false;
          return;
        }
        throw new Error(`Parcel ${trackingId} is already assigned to another delivery person`);
      }
      
      // Get current location with high accuracy (important!)
      console.log('Getting current location for new parcel...');
      
      // Temporarily disable minimum distance requirement for new parcels
      const originalMinDistance = this.minimumUpdateDistance;
      this.minimumUpdateDistance = 0;
      
      let location: Position;
      let locationDescription = 'Current Location';
      
      try {
        // First try to get location with Capacitor if available
        if (Capacitor.isPluginAvailable('Geolocation')) {
          try {
            // Request permissions first
            const permStatus = await Geolocation.requestPermissions();
            console.log('Geolocation permission status:', permStatus);
            
            location = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 15000
            });
            console.log('Capacitor location:', location);
          } catch (capacitorError) {
            console.log('Capacitor geolocation error, falling back to browser API:', capacitorError);
            location = await this.getBrowserLocationWithHighAccuracy();
          }
        } else {
          // Fall back to browser API
          location = await this.getBrowserLocationWithHighAccuracy();
        }
        
        // Get address for the location
        try {
          const addressResult = await runInInjectionContext(this.injector, async () => {
            return await firstValueFrom(this.geocodingService.getAddressFromCoordinates(
              location.coords.latitude, 
              location.coords.longitude
            ));
          });
          
          if (addressResult && addressResult.formatted_address) {
            locationDescription = addressResult.formatted_address;
            console.log('Geocoded address:', locationDescription);
          }
        } catch (geoError) {
          console.warn('Could not geocode address:', geoError);
          locationDescription = `Near ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`;
        }
      } catch (locationError) {
        console.error('Failed to get current location:', locationError);
        this.showToast('Unable to get your current location. Using default.');
        
        // Use default coordinates for Malaysia
        location = {
          coords: {
            latitude: 3.1390,
            longitude: 101.6869,
            accuracy: 500,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        };
        locationDescription = 'Unknown location in Malaysia';
      } finally {
        // Restore original minimum distance
        this.minimumUpdateDistance = originalMinDistance;
      }
      
      // Prepare assigned parcel data
      const assignedParcelData = {
        trackingId: trackingId,
        name: this.currentUserName,
        userId: this.currentUserId,
        userEmail: (await this.auth.currentUser)?.email,
        status: status,
        addedDate: new Date(),
        locationLat: location.coords.latitude,
        locationLng: location.coords.longitude,
        locationDescription: locationDescription,
        locationUpdatedAt: new Date()
      };
      
      console.log('Adding assigned parcel with data:', assignedParcelData);
      
      // Use runInInjectionContext for Firebase operations
      const docRef = await runInInjectionContext(this.injector, async () => {
        // Add to assigned_parcels
        const docId = await firstValueFrom(this.parcelService.addAssignedParcel(assignedParcelData));
        
        // Update main parcel status
        await firstValueFrom(this.parcelService.updateParcelStatus(parcelDetails.id, {
          status: status,
          deliverymanId: this.currentUserId,
          deliverymanName: this.currentUserName,
          updatedAt: new Date()
        }));
        
        // Add tracking event
        await firstValueFrom(this.trackingHistoryService.addTrackingEvent({
          trackingId: trackingId,
          parcelId: parcelDetails.id,
          status: status,
          title: status, // Just use the status directly as the title
          description: `Parcel ${status.toLowerCase()} - assigned to ${this.currentUserName}`,
          timestamp: new Date(),
          location: locationDescription,
          deliverymanId: this.currentUserId ?? undefined,
          deliverymanName: this.currentUserName ?? undefined
        }));
        
        return docId;
      });
      
      console.log('Assigned parcel document ID:', docRef);
      
      loading.dismiss();
      this.isAddingParcel = false;
      this.showToast(`Parcel ${trackingId} added successfully`);
      
      // Reset form
      this.parcelForm.reset({
        trackingId: '',
        status: 'In Transit'
      });
      
      // Reload assigned parcels
      this.loadAssignedParcels();
      
      // Force immediate location update to ensure tracking page gets data
      setTimeout(() => this.forceLocationUpdate(), 1000);
    } catch (error: any) {
      loading.dismiss();
      this.isAddingParcel = false;
      console.error('Error adding parcel:', error);
      this.showToast(`Error: ${error.message}`);
    }
  }

  // Force a location update (useful for manual refresh)
  async forceLocationUpdate() {
    console.log('Manual location update requested');
    if (this.isUpdatingLocation) {
      this.showToast('Location update already in progress');
      return;
    }
    
    const loading = await this.loadingCtrl.create({
      message: 'Updating your location...',
      spinner: 'circles'
    });
    
    await loading.present();
    
    try {
      // Temporarily disable minimum distance for forced updates
      const originalDistance = this.minimumUpdateDistance;
      this.minimumUpdateDistance = 0;
      
      await this.updateCurrentLocation();
      
      // Restore original distance threshold
      this.minimumUpdateDistance = originalDistance;
      
      loading.dismiss();
      
      if (this.lastLocationUpdate) {
        const time = this.lastLocationUpdate.toLocaleTimeString();
        this.showToast(`Location updated at ${time}`);
      } else {
        this.showToast('Location update completed');
      }
    } catch (error) {
      loading.dismiss();
      console.error('Forced location update failed:', error);
      this.showToast('Failed to update location');
    }
  }

  startBarcodeScanner() {
    if (this.isScanningBarcode) return;
    
    this.isScanningBarcode = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      if (!this.scannerElement?.nativeElement) {
        console.error('Scanner element not found');
        this.isScanningBarcode = false;
        this.cdr.detectChanges();
        return;
      }
      
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: this.scannerElement.nativeElement,
          constraints: {
            width: window.innerWidth,
            height: 300,
            facingMode: "environment"
          },
        },
        locator: {
          patchSize: "medium",
          halfSample: true
        },
        numOfWorkers: navigator.hardwareConcurrency || 2,
        decoder: {
          readers: ["code_128_reader", "ean_reader", "upc_reader"]
        }
      }, (err) => {
        if (err) {
          console.error('Quagga initialization error:', err);
          this.isScanningBarcode = false;
          this.cdr.detectChanges();
          return;
        }
        
        console.log('Quagga initialized successfully');
        Quagga.start();
        
        Quagga.onDetected((result) => {
          this.playSuccessBeep();
          const code = this.processDetectedCode(result.codeResult.code);
          
          this.zone.run(() => {
            this.parcelForm.patchValue({ trackingId: code });
            this.stopBarcodeScanner();
            this.showToast(`Detected barcode: ${code}`);
          });
        });
      });
    }, 800);
  }

  stopBarcodeScanner() {
    if (Quagga) {
      try {
        Quagga.stop();
      } catch (e) {
        console.log('Quagga already stopped');
      }
    }
    this.isScanningBarcode = false;
    this.cdr.detectChanges();
  }

  uploadBarcode() {
    if (!this.fileInput?.nativeElement) {
      this.showToast('File input not available');
      return;
    }
    
    this.fileInput.nativeElement.click();
  }

  async processUploadedImage(event: any) {
    const file = event?.target?.files?.[0];
    
    if (!file) return;
    
    this.isProcessingImage = true;
    this.cdr.detectChanges();
    
    try {
      const dataUrl = await this.readFileAsDataURL(file);
      
      Quagga.decodeSingle({
        src: dataUrl,
        numOfWorkers: 0,
        inputStream: { size: 800 },
        decoder: { readers: ["code_128_reader", "ean_reader", "upc_reader"] }
      }, (result) => {
        this.zone.run(() => {
          this.isProcessingImage = false;
          
          if (result?.codeResult) {
            this.playSuccessBeep();
            const code = this.processDetectedCode(result.codeResult.code);
            this.parcelForm.patchValue({ trackingId: code });
            this.showToast(`Detected barcode from image: ${code}`);
          } else {
            this.showToast('No barcode detected in the image');
          }
          
          this.resetFileInput();
          this.cdr.detectChanges();
        });
      });
    } catch (error) {
      console.error('Error processing uploaded image:', error);
      this.zone.run(() => {
        this.isProcessingImage = false;
        this.showToast('Failed to process the image');
        this.resetFileInput();
        this.cdr.detectChanges();
      });
    }
  }

  readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  resetFileInput() {
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  playSuccessBeep() {
    try {
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
    } catch (e) {
      console.warn('Unable to play beep:', e);
    }
  }

  async showToast(message: string, duration: number = 2000) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: duration,
      position: 'bottom',
      color: 'dark'
    });
    toast.present();
  }

  goBack() {
    this.navCtrl.navigateBack('/deliveryman-home');
  }

  // Toggle debug mode
  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    this.showToast(`Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`);
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
      // Take the first 8 digits or pad with zeros
      const numericPart = cleanCode.padEnd(8, '0').slice(0, 8);
      return `TR${numericPart}`;
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
    this.lastLocationUpdate = null;
    
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
    
    this.zone.run(() => {
      this.showToast('Session error. Please login again.');
      
      // Clear local storage
      localStorage.removeItem('userSession');
      
      // Force logout and redirect to login page
      runInInjectionContext(this.injector, () => {
        this.auth.signOut().then(() => {
          this.navCtrl.navigateRoot('/login');
        }).catch(error => {
          console.error('Error signing out:', error);
          this.navCtrl.navigateRoot('/login');
        });
      });
    });
  }

  // Get user data with comprehensive verification
  private async getUserName(userId: string): Promise<any> {
    try {
      return await runInInjectionContext(this.injector, async () => {
        const userDoc = await this.firestore.collection('users').doc(userId).get().toPromise();
        
        if (!userDoc?.exists) {
          console.error('User document not found');
          return null;
        }
        
        const userData = userDoc.data() as Record<string, any>;
        
        // Add ID to userData
        return { ...userData, id: userDoc.id };
      });
    } catch (error) {
      console.error('Error getting user name:', error);
      throw error;
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

  // Verify if the session is still fresh
  private verifySessionFreshness(): boolean {
    try {
      const sessionData = localStorage.getItem('userSession');
      if (!sessionData) return false;
      
      const userData = JSON.parse(sessionData);
      if (!userData.lastVerified) return false;
      
      const lastVerified = new Date(userData.lastVerified);
      const now = new Date();
      
      // Session valid for 2 hours
      const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
      
      return (now.getTime() - lastVerified.getTime()) < SESSION_TIMEOUT;
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
        console.warn('Session expired during periodic check');
        this.handleInvalidSession('Session expired');
      }
    }, 60000); // Every minute
  }

  // Improve the getBrowserLocationWithHighAccuracy method
  private async getBrowserLocationWithHighAccuracy(): Promise<Position> {
    return new Promise((resolve, reject) => {
      console.log('Getting browser location...');
      
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }

      // Try first with high accuracy (might be slow but precise)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Got high accuracy position:', position.coords.accuracy, 'm');
          resolve(position);
        },
        (highAccuracyError) => {
          console.warn('High accuracy position failed, trying with low accuracy:', highAccuracyError);
          
          // If high accuracy fails, try with lower accuracy settings
          navigator.geolocation.getCurrentPosition(
            (position) => {
              console.log('Got low accuracy position:', position.coords.accuracy, 'm');
              resolve(position);
            },
            (error) => {
              console.error('Both high and low accuracy geolocation failed:', error);
              reject(error);
            },
            { 
              enableHighAccuracy: false, // Use lower accuracy
              timeout: 10000,            // Shorter timeout for fallback
              maximumAge: 60000          // Accept positions up to 1 minute old
            }
          );
        },
        { 
          enableHighAccuracy: true, 
          timeout: 20000,       // Increased from 15000 to 20000
          maximumAge: 30000     // Accept positions up to 30 seconds old
        }
      );
    });
  }
  
  // Replace the getPositionWithTimeout method with this simplified version
  private getPositionWithTimeout(resolve: (value: Position) => void, reject: (reason: any) => void) {
    try {
      navigator.geolocation.getCurrentPosition(
        position => resolve(position),
        error => {
          console.warn('Geolocation error in getPositionWithTimeout:', error);
          reject(error);
        },
        { 
          enableHighAccuracy: false,  // Start with lower accuracy for faster response
          timeout: 20000,             // Longer timeout
          maximumAge: 60000           // Accept cached positions up to 1 minute old
        }
      );
    } catch (e) {
      reject(e);
    }
  }

  // Add these new methods to your component
  private startLocationUpdates() {
    // Stop any existing interval first
    this.stopLocationUpdates();

    console.log('Starting location updates every 2 minutes');
    // Update location every 2 minutes (120 seconds)
    this.locationUpdateInterval = setInterval(async () => {
      console.log('2-minute interval triggered: Updating location.');
      await this.updateCurrentLocation();
    }, 120 * 1000); // 120 seconds
    
    // Also update immediately when the page loads or after parcels are assigned
    setTimeout(() => {
      // Only trigger initial update if we have parcels
      if (this.assignedParcels.length > 0) {
        console.log('Initial location update for assigned parcels');
        this.updateCurrentLocation();
      } else {
        console.log('No parcels assigned yet, skipping initial location update');
      }
    }, 1000); // Update shortly after init
  }

  private stopLocationUpdates() {
    if (this.locationUpdateInterval) {
      console.log('Stopping location updates');
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  }

  private async updateCurrentLocation() {
    // Prevent concurrent updates
    if (this.isUpdatingLocation) {
      console.log('Location update already in progress. Skipping.');
      return;
    }

    // Ensure user is logged in and has assigned parcels
    if (!this.currentUserId || !this.currentUserName) {
      console.log('Skipping location update: No valid user session.');
      return;
    }
    
    // Check if we have any parcels to update
    if (this.assignedParcels.length === 0) {
      console.log('No parcels to update location for. Skipping update.');
      return;
    }

    this.isUpdatingLocation = true;
    console.log('Attempting to get current location for update...');

    try {
      // First try to get location with Capacitor if available
      let position: Position;
      
      if (Capacitor.isPluginAvailable('Geolocation')) {
        try {
          // Request permissions explicitly
          const permissionStatus = await Geolocation.requestPermissions();
          console.log('Location permission status:', permissionStatus);
          
          if (permissionStatus.location === 'denied') {
            throw new Error('Location permission denied');
          }
          
          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000
          });
          
          console.log('Got location via Capacitor:', position);
        } catch (capacitorError) {
          console.warn('Capacitor geolocation failed, trying browser API:', capacitorError);
          position = await this.getBrowserLocationWithHighAccuracy();
        }
      } else {
        // Fall back to browser API
        position = await this.getBrowserLocationWithHighAccuracy();
        console.log('Got location via browser API:', position);
      }
      
      // Process and update location in all assigned parcels
      await this.processAndUpdateLocation(position);
      
      // Update last update timestamp
      this.lastLocationUpdate = new Date();
      console.log('Location update successful at:', this.lastLocationUpdate);
    } catch (error) {
      console.error('Error updating location:', error);
      this.zone.run(() => {
        this.showToast('Failed to update location. Check permissions.');
      });
    } finally {
      this.isUpdatingLocation = false;
    }
  }

  private async processAndUpdateLocation(position: Position) {
    const newLat = position.coords.latitude;
    const newLng = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    console.log(`Got location: ${newLat}, ${newLng} (accuracy: ${accuracy}m)`);

    // Filter out low-accuracy readings but don't throw error
    if (accuracy > 100) {
      console.warn(`Location accuracy is poor (${accuracy}m), but continuing with update`);
    }

    let hasMovedEnough = true;
    if (this.lastLocationUpdate && this.minimumUpdateDistance > 0) {
      // Find the first assigned parcel with location data
      const parcelWithLocation = this.assignedParcels.find(p => 
        p.locationLat !== undefined && p.locationLng !== undefined
      );
      
      if (parcelWithLocation) {
        const distance = this.calculateDistance(
          parcelWithLocation.locationLat, 
          parcelWithLocation.locationLng,
          newLat,
          newLng
        );
        
        console.log(`Distance from last location: ${distance.toFixed(1)}m`);
        
        if (distance < this.minimumUpdateDistance) {
          console.log(`Haven't moved ${this.minimumUpdateDistance}m yet (${distance.toFixed(1)}m). Skipping update.`);
          hasMovedEnough = false;
        }
      }
    }
    
    if (!hasMovedEnough && this.minimumUpdateDistance > 0) {
      return; // Skip update if we haven't moved enough
    }

    // Get address from Google Maps
    let locationDescription = `Near ${newLat.toFixed(5)}, ${newLng.toFixed(5)}`;
    
    try {
      // Use the geocoding service to get an address
      const addressResult = await runInInjectionContext(this.injector, () => 
        firstValueFrom(this.geocodingService.getAddressFromCoordinates(newLat, newLng))
      );
      
      if (addressResult && addressResult.formatted_address) {
        locationDescription = addressResult.formatted_address;
        console.log('Got address:', locationDescription);
      }
    } catch (geocodeError) {
      console.warn('Failed to geocode location:', geocodeError);
    }
    
    // Create location data
    const updateTimestamp = new Date();
    const locationData = {
      locationLat: newLat,
      locationLng: newLng,
      locationDescription: locationDescription,
      locationUpdatedAt: updateTimestamp
    };
    
    console.log(`Updating ${this.assignedParcels.length} parcels with location: 
      Lat: ${newLat}, Lng: ${newLng}, 
      Description: ${locationDescription}, 
      Time: ${updateTimestamp}`);
    
    // Create a batch of promises to update all parcels
    const updatePromises = this.assignedParcels
      .filter(parcel => !!parcel.id) // Only update parcels with valid IDs
      .map(parcel => 
        runInInjectionContext(this.injector, () => 
          firstValueFrom(this.parcelService.updateParcelLocation(parcel.id!, locationData))
        )
      );
    
    // Execute all updates in parallel
    if (updatePromises.length > 0) {
      try {
        await Promise.all(updatePromises);
        console.log(`Successfully updated location for ${updatePromises.length} parcels`);
        
        // Update local parcel data to reflect new location
        this.zone.run(() => {
          this.assignedParcels.forEach(parcel => {
            parcel.locationLat = newLat;
            parcel.locationLng = newLng;
            parcel.locationDescription = locationDescription;
          });
          this.cdr.detectChanges();
        });
        
        // Update last location timestamp
        this.lastLocationUpdate = new Date();
      } catch (updateError) {
        console.error('Error updating parcel locations in Firestore:', updateError);
        throw new Error('Failed to update parcel locations in database');
      }
    } else {
      console.log('No valid parcels to update');
    }
  }

  // Add this method to your component
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = this.deg2rad(lat1);
    const φ2 = this.deg2rad(lat2);
    const Δφ = this.deg2rad(lat2 - lat1);
    const Δλ = this.deg2rad(lng2 - lng1);

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  // Add this method to check device capabilities
  private checkDeviceCapabilities() {
    // Check if device has geolocation
    const hasGeolocation = 'geolocation' in navigator;
    console.log('Device has geolocation:', hasGeolocation);
    
    // Check if Capacitor geolocation plugin is available
    const hasCapacitorGeo = Capacitor.isPluginAvailable('Geolocation');
    console.log('Capacitor Geolocation available:', hasCapacitorGeo);
    
    // Check if this is a native app
    const isNative = Capacitor.isNativePlatform();
    console.log('Running on native platform:', isNative);
    
    // Warn if no geolocation capabilities
    if (!hasGeolocation && !hasCapacitorGeo) {
      console.warn('No geolocation capabilities detected on this device');
      this.showToast('Warning: Device may not support location services', 3000);
    }
  }
}
