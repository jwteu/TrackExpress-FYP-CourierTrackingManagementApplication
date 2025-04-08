import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { IonicModule, NavController, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
import * as Quagga from 'quagga';
import firebase from 'firebase/compat/app';
import { RouterModule } from '@angular/router';
import { ParcelService, Parcel } from '../../services/parcel.service';
import { GeocodingService } from '../../services/geocoding.service';

@Component({
  selector: 'app-view-assigned-parcels',
  templateUrl: './view-assigned-parcels.page.html',
  styleUrls: ['./view-assigned-parcels.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule]
})
export class ViewAssignedParcelsPage implements OnInit, OnDestroy {
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

  constructor() {
    // Initialize form
    this.parcelForm = this.formBuilder.group({
      trackingId: ['', [Validators.required, Validators.minLength(3)]],
      status: ['In Transit', Validators.required]
    });
  }

  ngOnInit() {
    this.authSubscription = this.auth.authState.subscribe(user => {
      if (user) {
        this.currentUserId = user.uid;
        
        // Get user's name from Firestore
        this.getUserName(user.uid).then(userName => {
          this.currentUserName = userName || user.displayName || 'Unknown User';
          this.loadAssignedParcels();
        });
      } else {
        this.navCtrl.navigateRoot('/login');
      }
    });
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    this.stopBarcodeScanner();
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

  // Get user name from Firestore
  private async getUserName(userId: string): Promise<string | null> {
    try {
      const userData = await firstValueFrom(
        this.parcelService.getUserByID(userId)
      );
      
      if (userData) {
        return userData.name || null;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user name:', error);
      return null;
    }
  }

  loadAssignedParcels() {
    if (!this.currentUserName) return;
    
    this.isLoadingParcels = true;
    
    // Unsubscribe from any existing subscription first
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    
    this.parcelsSubscription = this.parcelService.getAssignedParcels(this.currentUserName).subscribe({
      next: async (parcels) => {
        console.log('Received assigned parcels:', parcels);
        const parcelsWithAddresses: Parcel[] = [];
        
        // For each assigned parcel, get additional details
        for (const parcel of parcels) {
          try {
            const parcelDetails = await firstValueFrom(
              this.parcelService.getParcelDetails(parcel.trackingId)
            );
            
            if (parcelDetails) {
              parcelsWithAddresses.push({
                ...parcel,
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
            
            const deleteTask = this.parcelService.removeAssignedParcel(parcel.id!);
            const resetTask = this.parcelService.resetParcelStatus(parcelDetails.id);
            
            return forkJoin([deleteTask, resetTask]);
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
    if (this.parcelForm.invalid) {
      this.showToast('Please enter a valid tracking ID');
      return;
    }
    
    const trackingId = this.parcelForm.get('trackingId')?.value;
    const status = this.parcelForm.get('status')?.value;
    
    if (!trackingId || !status) {
      this.showToast('Invalid form values');
      return;
    }
    
    const loading = await this.loadingCtrl.create({
      message: 'Adding parcel...'
    });
    
    await loading.present();
    this.isAddingParcel = true;
    
    try {
      // Check if parcel exists
      const parcelDetails = await firstValueFrom(
        this.parcelService.getParcelDetails(trackingId)
      );
      
      if (!parcelDetails) {
        throw new Error('Parcel not found with this tracking ID');
      }
      
      // Check if already assigned
      const isAssigned = await firstValueFrom(
        this.parcelService.isParcelAssigned(trackingId)
      );
      
      if (isAssigned) {
        throw new Error('This parcel is already assigned to a delivery person');
      }
      
      // Get current location
      let position: Position;
      if (Capacitor.isPluginAvailable('Geolocation')) {
        position = await Geolocation.getCurrentPosition();
      } else {
        throw new Error('Geolocation is not available on this device');
      }
      
      // Add to assigned parcels
      const assignedParcelData = {
        trackingId,
        name: this.currentUserName,
        locationLat: position.coords.latitude,
        locationLng: position.coords.longitude,
        addedDate: firebase.firestore.FieldValue.serverTimestamp(),
        status
      };
      
      console.log('Adding to assigned parcels:', assignedParcelData);
      
      // Use firstValueFrom to properly await the Observable
      const assignedId = await firstValueFrom(
        this.parcelService.addAssignedParcel(assignedParcelData)
      );
      
      console.log('Assigned parcel added with ID:', assignedId);
      
      // Update parcel status - also use firstValueFrom
      await firstValueFrom(
        this.parcelService.updateParcelStatus(parcelDetails.id, {
          status,
          deliverymanId: this.currentUserId,
          deliverymanName: this.currentUserName
        })
      );
      
      console.log('Parcel status updated in main collection');
      
      // Get address for notification using reverse geocoding
      const addressData = await firstValueFrom(
        this.geocodingService.getAddressFromCoordinates(
          position.coords.latitude,
          position.coords.longitude
        )
      );
      
      // Send email notification to receiver
      if (parcelDetails.receiverEmail) {
        await firstValueFrom(
          this.parcelService.sendEmailNotification(
            parcelDetails.receiverEmail,
            parcelDetails.receiverName || 'Valued Customer',
            trackingId,
            status,
            addressData.display_name || 'Unknown location'
          )
        );
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
}
