import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
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

  constructor(
    private fb: FormBuilder,
    public firestore: AngularFirestore,
    private router: Router,
    private location: Location,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.parcelForm = this.fb.group({
      senderName: ['', [Validators.required, Validators.pattern('^[a-zA-Z ]*$')]],
      senderContact: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      senderEmail: ['', [Validators.required, Validators.email]],
      senderAddress: ['', Validators.required],
      receiverName: ['', [Validators.required, Validators.pattern('^[a-zA-Z ]*$')]],
      receiverContact: ['', [Validators.required, Validators.pattern('^[0-9]*$')]],
      receiverEmail: ['', [Validators.required, Validators.email]],
      receiverAddress: ['', Validators.required],
      pickupLocation: ['', Validators.required],
      date: ['', Validators.required],
    });
  }

  ngOnInit() {
    // No initialization needed
  }

  async submit() {
    if (this.parcelForm.valid) {
      // Show loading spinner
      const loading = await this.loadingCtrl.create({
        message: 'Adding parcel and sending notifications...'
      });
      await loading.present();

      try {
        const trackingId = this.generateTrackingId();
        const barcodeId = uuidv4();
        const barcode = this.generateBarcode(barcodeId);
        const parcelData = {
          ...this.parcelForm.value,
          trackingId,
          barcode,
          createdAt: new Date()
        };

        // Log the form data
        console.log('Parcel data:', parcelData);

        // Add to Firestore
        await this.firestore.collection('parcels').add(parcelData);

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
      // Attempt to send the sender email first
      try {
        // Using simplified template parameters
        const senderParams = {
          service_id: 'service_o0nwz8b',
          template_id: 'template_5e1px4b',
          user_id: 'ghZzg_nWOdHQY6Krj',
          template_params: {
            tracking_id: parcelData.trackingId,
            date: new Date(parcelData.date).toLocaleDateString(),
            pickup_location: parcelData.pickupLocation,
            // EmailJS requires an email address to send to
            to_email: parcelData.senderEmail,
            // Include some standard email fields that EmailJS might need
            from_name: 'TrackExpress',
            reply_to: 'noreply@trackexpress.com'
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
        
        const senderResult = await senderResponse.text();
        console.log('Sender email result:', senderResult);
        
        if (!senderResponse.ok) {
          throw new Error(`Failed to send sender email: ${senderResult}`);
        }
      } catch (senderError) {
        console.error('Sender email failed:', senderError);
        // Continue with receiver email even if sender email fails
      }
      
      // Now attempt to send receiver email
      try {
        const receiverParams = {
          service_id: 'service_o0nwz8b',
          template_id: 'template_1yqzf6m',
          user_id: 'ghZzg_nWOdHQY6Krj',
          template_params: {
            tracking_id: parcelData.trackingId,
            date: new Date(parcelData.date).toLocaleDateString(),
            pickup_location: parcelData.pickupLocation,
            // EmailJS requires an email address to send to
            to_email: parcelData.receiverEmail,
            // Include some standard email fields that EmailJS might need
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
    return 'TRK-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  generateBarcode(barcodeId: string): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, barcodeId, { format: 'CODE128' });
    return canvas.toDataURL('image/png');
  }

  goBack() {
    this.location.back();
  }
}