import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { LoadingController, ToastController, IonicModule } from '@ionic/angular';
import { Location, CommonModule } from '@angular/common';

@Component({
  selector: 'app-edit-parcel',
  templateUrl: './edit-parcel.page.html',
  styleUrls: ['./edit-parcel.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule // Import IonicModule to use Ionic components like ion-icon and ion-spinner
  ]
})
export class EditParcelPage implements OnInit {
  parcelId: string = '';
  parcelForm: FormGroup;
  loading: boolean = true;
  loadingError: boolean = false;
  saving: boolean = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private firestore: AngularFirestore,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private location: Location
  ) {
    // Initialize the form - only sender and receiver fields are editable
    this.parcelForm = this.fb.group({
      // Non-editable fields (display only)
      trackingId: [{ value: '', disabled: true }],
      date: [{ value: '', disabled: true }],
      barcode: [{ value: '', disabled: true }],
      pickupLocation: [{ value: '', disabled: true }],
      
      // Editable sender fields
      senderName: ['', Validators.required],
      senderContact: ['', Validators.required],
      senderEmail: ['', [Validators.required, Validators.email]],
      senderAddress: ['', Validators.required],
      
      // Editable receiver fields
      receiverName: ['', Validators.required],
      receiverContact: ['', Validators.required],
      receiverEmail: ['', [Validators.required, Validators.email]],
      receiverAddress: ['', Validators.required]
    });
  }

  async ngOnInit() {
    const loading = await this.loadingCtrl.create({
      message: 'Loading parcel details...',
      spinner: 'circles'
    });
    await loading.present();

    // Get the parcel ID from the URL
    this.parcelId = this.route.snapshot.paramMap.get('id') || '';
    
    if (this.parcelId) {
      this.firestore.collection('parcels').doc(this.parcelId).get().subscribe(
        doc => {
          if (doc.exists) {
            const data = doc.data() as Record<string, any>;
            
            // Format date for display
            const formattedDate = data['date'] ? new Date(data['date']).toLocaleString() : '';
            
            // Update the form with the parcel data - using bracket notation to fix TypeScript errors
            this.parcelForm.patchValue({
              trackingId: data['trackingId'] || '',
              date: formattedDate,
              barcode: data['barcode'] || '',
              pickupLocation: data['pickupLocation'] || '',
              
              // Editable fields
              senderName: data['senderName'] || '',
              senderContact: data['senderContact'] || '',
              senderEmail: data['senderEmail'] || '',
              senderAddress: data['senderAddress'] || '',
              receiverName: data['receiverName'] || '',
              receiverContact: data['receiverContact'] || '',
              receiverEmail: data['receiverEmail'] || '',
              receiverAddress: data['receiverAddress'] || ''
            });
            
            this.loading = false;
          } else {
            this.loading = false;
            this.loadingError = true;
          }
          loading.dismiss();
        },
        error => {
          console.error('Error fetching parcel:', error);
          this.loading = false;
          this.loadingError = true;
          loading.dismiss();
        }
      );
    } else {
      this.loading = false;
      this.loadingError = true;
      loading.dismiss();
    }
  }

  goBack() {
    this.location.back();
  }

  async saveChanges() {
    if (this.parcelForm.valid) {
      this.saving = true;
      const loading = await this.loadingCtrl.create({
        message: 'Saving changes...'
      });
      await loading.present();
  
      try {
        // Get form values and include ONLY sender and receiver fields
        const parcelData = {
          senderName: this.parcelForm.get('senderName')?.value,
          senderContact: this.parcelForm.get('senderContact')?.value,
          senderEmail: this.parcelForm.get('senderEmail')?.value,
          senderAddress: this.parcelForm.get('senderAddress')?.value,
          receiverName: this.parcelForm.get('receiverName')?.value,
          receiverContact: this.parcelForm.get('receiverContact')?.value,
          receiverEmail: this.parcelForm.get('receiverEmail')?.value,
          receiverAddress: this.parcelForm.get('receiverAddress')?.value,
          lastModified: new Date()
        };
  
        // Update the parcel in Firestore
        await this.firestore.collection('parcels').doc(this.parcelId).update(parcelData);
  
        loading.dismiss();
        this.saving = false;
  
        // Show success message
        const toast = await this.toastCtrl.create({
          message: 'Parcel information updated successfully!',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
  
        // Navigate to the manage-parcel page
        this.router.navigate(['/manage-parcel']);
      } catch (error) {
        loading.dismiss();
        this.saving = false;
        console.error('Error updating parcel:', error);
  
        // Show error toast
        const toast = await this.toastCtrl.create({
          message: 'Failed to update parcel information. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    } else {
      // Mark all controls as touched to show validation errors
      Object.keys(this.parcelForm.controls).forEach(key => {
        this.parcelForm.get(key)?.markAsTouched();
      });
  
      // Show validation error toast
      const toast = await this.toastCtrl.create({
        message: 'Please fill out all required fields correctly.',
        duration: 2000,
        color: 'warning',
        position: 'bottom'
      });
      await toast.present();
    }
  }
}