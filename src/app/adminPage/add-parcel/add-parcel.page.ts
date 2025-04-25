import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController, AlertController } from '@ionic/angular';
import * as JsBarcode from 'jsbarcode';
import { Location } from '@angular/common';

@Component({
  selector: 'app-add-parcel',
  templateUrl: './add-parcel.page.html',
  styleUrls: ['./add-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AddParcelPage implements OnInit {
  parcelForm: FormGroup;
  isGettingLocation = false;
  currentLocation: string = '';
  
  // Angular 19 injection pattern with Injector
  private fb = inject(FormBuilder);
  private firestore = inject(AngularFirestore);
  private router = inject(Router);
  private location = inject(Location);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private injector = inject(Injector); // Add this line
  
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
      receiverName: ['', [Validators.required, Validators.pattern('^[a-zA-Z ]*$')]],
      receiverContact: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      receiverEmail: ['', [
        Validators.required, 
        Validators.email,
        Validators.pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$')
      ]],
      receiverAddress: ['', Validators.required],
      pickupLocation: ['', Validators.required],
      date: ['', Validators.required],
    });
  }

  ngOnInit() {
    // Initialize with current date
    const today = new Date().toISOString().split('T')[0];
    this.parcelForm.patchValue({
      date: today
    });
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
    
    this.isGettingLocation = true;
    const loading = await this.loadingCtrl.create({
      message: 'Getting your location...',
      spinner: 'circles'
    });
    await loading.present();
  
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords;
          console.log(`Location detected: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
          
          // Use reverse geocoding to get a detailed address from coordinates
          // Using OpenStreetMap's Nominatim API with more parameters
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?` +
            `format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          
          if (!response.ok) {
            throw new Error('Failed to get address from coordinates');
          }
          
          const data = await response.json();
          console.log('Location data:', data);
          
          // Format the address with more details
          let address = '';
          
          if (data.address) {
            // More detailed address formatting
            const addressComponents = [];
            
            // Building information
            if (data.address.house_number) addressComponents.push(data.address.house_number);
            if (data.address.building) addressComponents.push(data.address.building);
            
            // Street information
            if (data.address.road || data.address.street) {
              addressComponents.push(data.address.road || data.address.street);
            }
            
            // Neighborhood information
            if (data.address.neighbourhood) addressComponents.push(data.address.neighbourhood);
            if (data.address.suburb) addressComponents.push(data.address.suburb);
            
            // City/town information
            if (data.address.city) addressComponents.push(data.address.city);
            else if (data.address.town) addressComponents.push(data.address.town);
            else if (data.address.village) addressComponents.push(data.address.village);
            
            // Region information
            if (data.address.county) addressComponents.push(data.address.county);
            if (data.address.state || data.address.province) {
              addressComponents.push(data.address.state || data.address.province);
            }
            
            // Postal code
            if (data.address.postcode) addressComponents.push(data.address.postcode);
            
            // Country
            if (data.address.country) addressComponents.push(data.address.country);
            
            address = addressComponents.join(', ');
            
            // Add any additional information if not already included
            if (data.display_name && !address) {
              address = data.display_name;
            }
          } else {
            // Fallback to display_name or coordinates
            address = data.display_name || `Latitude: ${latitude}, Longitude: ${longitude}`;
          }
          
          this.currentLocation = address;
          this.parcelForm.patchValue({
            pickupLocation: address
          });
          
          loading.dismiss();
          this.isGettingLocation = false;
          
          const toast = await this.toastCtrl.create({
            message: 'Location detected successfully!',
            duration: 2000,
            position: 'bottom',
            color: 'success'
          });
          await toast.present();
        } catch (error) {
          console.error('Error getting address:', error);
          loading.dismiss();
          this.isGettingLocation = false;
          
          const toast = await this.toastCtrl.create({
            message: 'Failed to get address. Please enter manually.',
            duration: 3000,
            position: 'bottom',
            color: 'danger'
          });
          await toast.present();
        }
      },
      async (error) => {
        console.error('Geolocation error:', error);
        loading.dismiss();
        this.isGettingLocation = false;
        
        let errorMessage = 'Failed to get your location.';
        if (error.code === 1) {
          errorMessage = 'Location permission denied. Please enable location services.';
        } else if (error.code === 2) {
          errorMessage = 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
          errorMessage = 'Location request timed out. Please try again.';
        }
        
        const toast = await this.toastCtrl.create({
          message: errorMessage,
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        await toast.present();
      },
      {
        enableHighAccuracy: true, // Request the most accurate position available
        timeout: 15000,          // Allow more time (15 seconds) to get a good position
        maximumAge: 0            // Don't use cached position data
      }
    );
  }

  async geocodeReceiverAddress() {
    const receiverAddress = this.parcelForm.get('receiverAddress')?.value;
    
    if (!receiverAddress) {
      return;
    }
    
    const loading = await this.loadingCtrl.create({
      message: 'Finding address...',
      spinner: 'circles'
    });
    await loading.present();
    
    try {
      // Use Nominatim with a higher limit to get multiple results
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(receiverAddress)}&limit=5`
      );
      
      if (!response.ok) {
        throw new Error('Failed to geocode address');
      }
      
      const data = await response.json();
      loading.dismiss();
      
      if (data && data.length > 0) {
        // Show a list of potential matches for the user to choose from
        const alert = await this.alertCtrl.create({
          header: 'Select Correct Address',
          message: 'Please choose the closest match to your address:',
          inputs: data.map((result: any, index: number) => ({
            type: 'radio',
            label: result.display_name,
            value: index.toString(),
            checked: index === 0
          })),
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel'
            },
            {
              text: 'Select',
              handler: (value) => {
                const selectedIndex = parseInt(value);
                const selectedAddress = data[selectedIndex];
                
                // Save these coordinates to form fields
                this.parcelForm.addControl('receiverLat', new FormControl(parseFloat(selectedAddress.lat)));
                this.parcelForm.addControl('receiverLng', new FormControl(parseFloat(selectedAddress.lon)));
                
                // Update the address text field with the formatted address
                this.parcelForm.patchValue({
                  receiverAddress: selectedAddress.display_name
                });
                
                this.showToast('Address verified successfully');
              }
            }
          ]
        });
        
        await alert.present();
      } else {
        loading.dismiss();
        const toast = await this.toastCtrl.create({
          message: 'No addresses found. Try adding more details (city, postal code).',
          duration: 3000,
          position: 'bottom',
          color: 'warning'
        });
        await toast.present();
      }
    } catch (error) {
      loading.dismiss();
      console.error('Error geocoding address:', error);
      const toast = await this.toastCtrl.create({
        message: 'Could not verify address location',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    }
  }

  async submit() {
    if (this.parcelForm.valid) {
      // Show loading spinner
      const loading = await this.loadingCtrl.create({
        message: 'Adding parcel and sending notifications...'
      });
      await loading.present();
  
      try {
        // Generate a shorter, more scannable tracking ID
        const trackingId = this.generateTrackingId();
        
        // Use the tracking ID directly for the barcode
        const barcode = this.generateBarcode(trackingId);
        
        // Get receiver coordinates (if available)
        const receiverLat = this.parcelForm.get('receiverLat')?.value;
        const receiverLng = this.parcelForm.get('receiverLng')?.value;
        
        const parcelData = {
          ...this.parcelForm.value,
          trackingId,
          barcode,
          // Include these coordinates if they exist
          receiverLat: receiverLat || null,
          receiverLng: receiverLng || null,
          createdAt: new Date().toISOString()
        };
  
        // Log the form data
        console.log('Parcel data:', parcelData);
  
        // Add to Firestore with proper injection context
        try {
          // Use runInInjectionContext to ensure Firebase operations run in the correct context
          const docRef = await runInInjectionContext(this.injector, async () => {
            return await this.firestore.collection('parcels').add(parcelData);
          });
          console.log('Document written with ID: ', docRef.id);
        } catch (firestoreError: unknown) {
          console.error('Firestore write error:', firestoreError);
          if (firestoreError instanceof Error) {
            throw new Error(`Firestore write failed: ${firestoreError.message}`);
          } else {
            throw new Error(`Firestore write failed: ${JSON.stringify(firestoreError)}`);
          }
        }
  
        // Send email notifications
        await this.sendEmailNotifications(parcelData);
  
        loading.dismiss();
  
        // Show success message
        const toast = await this.toastCtrl.create({
          message: 'Parcel registered successfully! Email notifications have been sent.',
          duration: 3000,
          position: 'bottom',
          color: 'success'
        });
        await toast.present();
  
        // Navigate back
        this.location.back();
      } catch (error) {
        loading.dismiss();
        console.error('Error in submit:', error);
  
        // Show error toast with detailed message
        const toast = await this.toastCtrl.create({
          message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
          duration: 3000,
          position: 'bottom',
          color: 'danger'
        });
        await toast.present();
      }
    } else {
      // Show validation error
      const toast = await this.toastCtrl.create({
        message: 'Please fill out all required fields correctly.',
        duration: 3000,
        position: 'bottom',
        color: 'warning'
      });
      await toast.present();
    }
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
    
    // Use the tracking ID directly for the barcode
    JsBarcode(canvas, trackingId, { 
      format: 'CODE128',    // CODE128 is widely supported by most scanners
      width: 2,             // Wider bars are easier to scan
      height: 80,           // Taller barcode for better scanning
      displayValue: true,   // Show the value below the barcode
      fontSize: 14,         // Larger text size
      margin: 10,           // Add margin around the barcode
      background: '#ffffff' // White background for better contrast
    });
    
    return canvas.toDataURL('image/png');
  }

  goBack() {
    this.location.back();
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
      color: 'success'
    });
    await toast.present();
  }
}