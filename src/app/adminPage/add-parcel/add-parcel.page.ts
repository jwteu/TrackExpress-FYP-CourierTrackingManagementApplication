import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, inject, NgZone, CUSTOM_ELEMENTS_SCHEMA, Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { LoadingController, ToastController, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { LocationEnablerService } from '../../services/location-enabler.service';
import JsBarcode from 'jsbarcode';

declare var google: any; // Declare google

@Component({
  selector: 'app-add-parcel',
  templateUrl: './add-parcel.page.html',
  styleUrls: ['./add-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AddParcelPage implements OnInit, AfterViewInit, OnDestroy { // Implement AfterViewInit and OnDestroy
  parcelForm: FormGroup;
  isGettingLocation = false;
  currentLocation: string = '';

  // Add ViewChild decorators for address inputs
  @ViewChild('senderAddressInput', { static: false, read: ElementRef }) senderAddressInputRef!: ElementRef;
  @ViewChild('receiverAddressInput', { static: false, read: ElementRef }) receiverAddressInputRef!: ElementRef;

  private senderAutocomplete: any;
  private receiverAutocomplete: any;
  private senderAutocompleteListener: any;
  private receiverAutocompleteListener: any;
  private geocoder: any; // Add geocoder instance

  // Angular 19 injection pattern with Injector
  private fb = inject(FormBuilder);
  private firestore = inject(AngularFirestore);
  private router = inject(Router);
  private location = inject(Location);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private zone = inject(NgZone); // Inject NgZone
  private injector = inject(Injector);
  private locationEnabler = inject(LocationEnablerService);

  constructor() {
    this.parcelForm = this.fb.group({
      senderName: ['', [Validators.required, Validators.pattern('^[a-zA-Z ]*$')]],
      senderContact: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      senderEmail: ['', [
        Validators.required,
        Validators.email,
        Validators.pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$')
      ]],
      senderAddress: ['', Validators.required],
      senderLat: [null], // Add sender coordinates
      senderLng: [null], // Add sender coordinates
      receiverName: ['', [Validators.required, Validators.pattern('^[a-zA-Z ]*$')]],
      receiverContact: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      receiverEmail: ['', [
        Validators.required,
        Validators.email,
        Validators.pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$')
      ]],
      receiverAddress: ['', Validators.required],
      receiverLat: [null], // Keep receiver coordinates
      receiverLng: [null], // Keep receiver coordinates
      pickupLocation: ['', Validators.required],
      date: ['', Validators.required],
    });
  }

  ngOnInit() {
    const today = new Date().toISOString().split('T')[0];
    this.parcelForm.patchValue({
      date: today
    });
    this.geocoder = new google.maps.Geocoder(); // Initialize geocoder
  }

  ngAfterViewInit() {
    // Initialize Autocomplete after view is ready
    this.initAutocomplete();
  }

  ngOnDestroy() {
    // Clean up listeners to prevent memory leaks
    if (this.senderAutocompleteListener) {
      google.maps.event.removeListener(this.senderAutocompleteListener);
    }
    if (this.receiverAutocompleteListener) {
      google.maps.event.removeListener(this.receiverAutocompleteListener);
    }
    // Clear references if needed, though Angular handles component destruction
    if (google && google.maps && google.maps.event) {
        google.maps.event.clearInstanceListeners(this.senderAddressInputRef?.nativeElement);
        google.maps.event.clearInstanceListeners(this.receiverAddressInputRef?.nativeElement);
    }
  }


  private initAutocomplete() {
  // Ensure Google Maps API is loaded
  if (typeof google === 'undefined' || !google.maps) {
    console.error('Google Maps API not loaded.');
    this.showToast('Error initializing address autocomplete.', 'danger');
    return;
  }

  // Check if Places API is available
  if (!google.maps.places) {
    console.error('Google Maps Places API not loaded.');
    this.showToast('Address autocompletion is not available.', 'warning');
    return;
  }

  const options = {
    componentRestrictions: { country: 'my' }, // Restrict to Malaysia
    fields: ['address_components', 'geometry', 'icon', 'name', 'formatted_address'],
    types: ['address']
  };

  try {
    // Initialize sender autocomplete
    if (this.senderAddressInputRef?.nativeElement) {
      // Get the actual native input element from ion-input - this is the key fix
      setTimeout(() => {
        // Find the input inside the shadow DOM
        const nativeInputEl = this.senderAddressInputRef.nativeElement.querySelector('input');
        
        if (!nativeInputEl) {
          console.error('Sender address native input element not found');
          return;
        }
        
        this.senderAutocomplete = new google.maps.places.Autocomplete(
          nativeInputEl,
          options
        );
        
        this.senderAutocompleteListener = this.senderAutocomplete.addListener('place_changed', () => {
          this.zone.run(() => {
            const place = this.senderAutocomplete.getPlace();
            if (place && place.geometry) {
              this.useGeocodedAddress(place, 'sender');
            } else {
              console.warn("Autocomplete place not found for sender.");
              this.geocodeAddress(this.parcelForm.get('senderAddress')?.value, 'sender');
            }
          });
        });
      }, 300);
    }

    // Initialize receiver autocomplete - use the same approach
    if (this.receiverAddressInputRef?.nativeElement) {
      setTimeout(() => {
        // Find the input inside the shadow DOM
        const nativeInputEl = this.receiverAddressInputRef.nativeElement.querySelector('input');
        
        if (!nativeInputEl) {
          console.error('Receiver address native input element not found');
          return;
        }
        
        this.receiverAutocomplete = new google.maps.places.Autocomplete(
          nativeInputEl,
          options
        );
        
        this.receiverAutocompleteListener = this.receiverAutocomplete.addListener('place_changed', () => {
          this.zone.run(() => {
            const place = this.receiverAutocomplete.getPlace();
            if (place && place.geometry) {
              this.useGeocodedAddress(place, 'receiver');
            } else {
              console.warn("Autocomplete place not found for receiver.");
              this.geocodeAddress(this.parcelForm.get('receiverAddress')?.value, 'receiver');
            }
          });
        });
      }, 300);
    }
  } catch (error) {
    console.error("Error initializing Google Maps Autocomplete:", error);
    this.showToast('Failed to initialize address search.', 'danger');
  }
}

  // Modified function to use the selected PlaceResult
  useGeocodedAddress(place: any, type: 'sender' | 'receiver') {
    if (!place.geometry || !place.geometry.location) {
      this.showToast('Selected address is missing location data.', 'warning');
      return;
    }

    const location = place.geometry.location;
    const lat = location.lat();
    const lng = location.lng();
    let formattedAddress = place.formatted_address || '';
    
    // Remove ", Malaysia" from the end if present
    formattedAddress = formattedAddress.replace(/, Malaysia$/, '');

    console.log(`${type} address selected:`, formattedAddress, `(${lat}, ${lng})`);

    // Update the correct form fields
    if (type === 'sender') {
      this.parcelForm.patchValue({
        senderAddress: formattedAddress,
        senderLat: lat,
        senderLng: lng
      });
    } else {
      this.parcelForm.patchValue({
        receiverAddress: formattedAddress,
        receiverLat: lat,
        receiverLng: lng
      });
    }

    this.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} address verified.`);
  }

  // Generic function to geocode manually entered text
  async geocodeAddress(address: string, type: 'sender' | 'receiver') {
    // *** ADD THIS CHECK ***
    // If we already have coordinates from autocomplete, don't re-geocode on blur/submit
    const latControl = type === 'sender' ? 'senderLat' : 'receiverLat';
    if (this.parcelForm.get(latControl)?.value) {
      console.log(`Coordinates already exist for ${type}, skipping manual geocode.`);
      return; 
    }
    // *** END OF ADDED CHECK ***

    if (!address || address.trim() === '') {
      // Clear coordinates if address is empty
       if (type === 'sender') {
          this.parcelForm.patchValue({ senderLat: null, senderLng: null });
       } else {
          this.parcelForm.patchValue({ receiverLat: null, receiverLng: null });
       }
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: `Verifying ${type} address...`,
      spinner: 'circles'
    });
    await loading.present();

    this.geocoder.geocode({ 'address': address, componentRestrictions: { country: 'my' } }, (results: google.maps.GeocoderResult[], status: google.maps.GeocoderStatus) => {
      loading.dismiss();
      this.zone.run(() => { 
          if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
             const placeResult: any = {
              geometry: results[0].geometry,
              formatted_address: results[0].formatted_address,
              address_components: results[0].address_components,
            };
            // This call might still simplify the address if coordinates didn't exist before,
            // but it won't overwrite a good autocomplete selection.
            this.useGeocodedAddress(placeResult, type); 
          } else {
            console.warn(`Geocoding failed for ${type} address: ${status}`);
            this.showToast(`Could not verify ${type} address. Please check and try again.`, 'warning');
             if (type === 'sender') {
                this.parcelForm.patchValue({ senderLat: null, senderLng: null });
             } else {
                this.parcelForm.patchValue({ receiverLat: null, receiverLng: null });
             }
          }
      });
    });
  }


  async submit() {
    // Trigger geocoding for potentially manually edited fields before submitting
    await this.geocodeAddress(this.parcelForm.get('senderAddress')?.value, 'sender');
    await this.geocodeAddress(this.parcelForm.get('receiverAddress')?.value, 'receiver');

    // Short delay to allow geocoding results to update the form
    await new Promise(resolve => setTimeout(resolve, 300));

    if (this.parcelForm.valid) {
      // Check if coordinates are present
      if (!this.parcelForm.get('senderLat')?.value || !this.parcelForm.get('senderLng')?.value) {
        this.showToast('Sender address could not be verified. Please select from suggestions or check the address.', 'warning');
        return;
      }
      if (!this.parcelForm.get('receiverLat')?.value || !this.parcelForm.get('receiverLng')?.value) {
        this.showToast('Receiver address could not be verified. Please select from suggestions or check the address.', 'warning');
        return;
      }

      const loading = await this.loadingCtrl.create({
        message: 'Adding parcel and sending notifications...'
      });
      await loading.present();

      try {
        const trackingId = this.generateTrackingId();
        const barcode = this.generateBarcode(trackingId);

        // Get all form values including coordinates
        const parcelData = {
          ...this.parcelForm.value,
          trackingId,
          barcode,
          createdAt: new Date().toISOString()
        };

        console.log('Parcel data:', parcelData);

        // Wrap Firestore operation in runInInjectionContext
        const injector = this.injector;
        await runInInjectionContext(injector, async () => {
          await this.firestore.collection('parcels').add(parcelData);
        });

        await this.sendEmailNotifications(parcelData);

        loading.dismiss();
        
        this.parcelForm.reset();
        this.parcelForm.patchValue({
          date: new Date().toISOString().split('T')[0]
        });
        
        const alert = await this.alertCtrl.create({
          header: 'Success',
          message: `Parcel added successfully with tracking ID: ${trackingId}`,
          buttons: ['OK']
        });
        
        await alert.present();
      } catch (error) {
        console.error('Error adding parcel:', error);
        loading.dismiss();
        this.showToast('An error occurred while adding the parcel. Please try again.', 'danger');
      }
    } else {
      this.showToast('Please fill out all required fields correctly.', 'warning');
      // Log invalid controls for debugging
      Object.keys(this.parcelForm.controls).forEach(key => {
        const control = this.parcelForm.get(key);
        if (control?.invalid) {
          console.log(`Control ${key} is invalid:`, control.errors);
        }
      });
    }
  }

  async getDeviceLocation() {
    if (!navigator.geolocation) {
      const toast = await this.toastCtrl.create({
        message: 'Geolocation is not supported by your browser',
        duration: 3000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
      return;
    }
    
    // First check if location is enabled
    const locationEnabled = await this.locationEnabler.ensureLocationEnabled();
    if (!locationEnabled) {
      this.showToast('Location services must be enabled to detect your current location.', 'warning');
      return;
    }
    
    this.isGettingLocation = true;
    const loading = await this.loadingCtrl.create({
      message: 'Getting your location...',
      spinner: 'circles'
    });
    await loading.present();

    // If on Android, request high accuracy mode first
    if (Capacitor.getPlatform() === 'android') {
      await this.locationEnabler.requestHighAccuracyLocation();
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Location detected: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);

          // Use the initialized geocoder
          const latlng = new google.maps.LatLng(latitude, longitude);

          this.geocoder.geocode({ 'location': latlng }, (results: google.maps.GeocoderResult[], status: google.maps.GeocoderStatus) => {
            loading.dismiss();
            this.isGettingLocation = false;
            this.zone.run(() => { // Run in zone
                if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
                  const address = results[0].formatted_address;
                  this.currentLocation = address;
                  this.parcelForm.patchValue({
                    pickupLocation: address
                  });
                  this.showToast('Location detected successfully!');
                } else {
                  const fallbackAddress = `Latitude: ${latitude}, Longitude: ${longitude}`;
                  this.currentLocation = fallbackAddress;
                  this.parcelForm.patchValue({
                    pickupLocation: fallbackAddress
                  });
                  this.showToast('Got location coordinates, but couldn\'t get address.', 'warning');
                }
            });
          });
        } catch (error) {
           loading.dismiss(); // Ensure loading dismissed on error
           this.isGettingLocation = false; // Ensure flag reset on error
          console.error('Error getting address:', error);
          this.showToast('Failed to get address. Please enter manually.', 'danger');
        }
      },
      async (error) => {
        loading.dismiss();
        this.isGettingLocation = false;
        console.error('Geolocation error:', error);
        
        // Improved error handling
        let errorMessage = 'Failed to get your location.';
        if (error.code === 1) {
          errorMessage = 'Location permission denied. Please enable location permissions in your device settings.';
          // Show option to open settings on permission denied
          const alert = await this.alertCtrl.create({
            header: 'Location Permission Required',
            message: 'This feature requires location permission. Would you like to open settings to enable it?',
            buttons: [
              {
                text: 'Cancel',
                role: 'cancel'
              },
              {
                text: 'Open Settings',
                handler: () => {
                  if (Capacitor.isNativePlatform()) {
                    // This will open location settings on Android
                    this.locationEnabler.requestHighAccuracyLocation();
                  }
                }
              }
            ]
          });
          await alert.present();
        } else if (error.code === 2) {
          errorMessage = 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
          errorMessage = 'Location request timed out. Please try again.';
        }
        
        this.showToast(errorMessage, 'danger');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  async sendEmailNotifications(parcelData: any) {
    try {
      // Validate email addresses before sending
      const validateEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      // Sanitize email - remove any whitespace and validate
      const senderEmail = parcelData.senderEmail?.trim();
      const receiverEmail = parcelData.receiverEmail?.trim();

      if (!validateEmail(senderEmail)) {
        console.warn('Invalid sender email format:', senderEmail);
        throw new Error('Sender email format is invalid');
      }

      if (!validateEmail(receiverEmail)) {
        console.warn('Invalid receiver email format:', receiverEmail);
        throw new Error('Receiver email format is invalid');
      }

      // Attempt to send the sender email first
      try {
        // Using simplified template parameters
        const senderParams = {
          service_id: 'service_o0nwz8b',
          template_id: 'template_5e1px4b',
          user_id: 'T1yl0I9kdv0wiyZtr', // CHANGE THIS LINE - use the working user ID
          template_params: {
            tracking_id: parcelData.trackingId,
            date: new Date(parcelData.date).toLocaleDateString(),
            pickup_location: parcelData.pickupLocation,
            to_email: senderEmail, // Use validated email
            to_name: parcelData.senderName || 'Customer',
            from_name: 'TrackExpress',
            reply_to: 'noreply@trackexpress.com',
            status: 'Registered' // Add status parameter
          }
        };

        console.log('Attempting to send sender email with params:', JSON.stringify(senderParams));
        
        const senderResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(senderParams)
        });
        
        if (!senderResponse.ok) {
          const errorText = await senderResponse.text();
          console.error('Sender email API response:', errorText);
          throw new Error(`Failed to send sender email: ${errorText}`);
        }
        
        console.log('Sender email sent successfully');
      } catch (senderError) {
        console.error('Sender email failed:', senderError);
        // Continue with receiver email even if sender email fails
      }
      
      // Now attempt to send receiver email
      try {
        const receiverParams = {
          service_id: 'service_o0nwz8b',
          template_id: 'template_1yqzf6m',
          user_id: 'T1yl0I9kdv0wiyZtr', // CHANGE THIS LINE - use the working user ID
          template_params: {
            tracking_id: parcelData.trackingId,
            date: new Date(parcelData.date).toLocaleDateString(),
            to_name: parcelData.receiverName || 'Customer',
            location_info: parcelData.pickupLocation,
            to_email: receiverEmail, // Use validated email
            from_name: 'TrackExpress',
            reply_to: 'noreply@trackexpress.com',
            status: 'Registered' // Add status parameter
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
        
        if (!receiverResponse.ok) {
          const errorText = await receiverResponse.text();
          console.error('Receiver email API response:', errorText);
          throw new Error(`Failed to send receiver email: ${errorText}`);
        }
        
        console.log('Receiver email sent successfully');
      } catch (receiverError) {
        console.error('Receiver email failed:', receiverError);
        // We've already attempted both emails, so we'll throw the error
        throw receiverError;
      }

      return true;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  generateTrackingId(): string {
    // Create a shorter tracking ID (10 characters)
    return 'TR' + Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  generateBarcode(trackingId: string): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, trackingId, {
      format: 'CODE128',
      width: 2,
      height: 80,
      displayValue: true,
      fontSize: 14,
      margin: 10,
      background: '#ffffff'
    });
    return canvas.toDataURL('image/png');
  }

  goBack() {
    this.location.back();
  }

  // Updated showToast to accept color
  private async showToast(message: string, color: string = 'success') { // Default to success
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000, // Increased duration
      position: 'bottom',
      color: color // Use the passed color
    });
    await toast.present();
  }
}