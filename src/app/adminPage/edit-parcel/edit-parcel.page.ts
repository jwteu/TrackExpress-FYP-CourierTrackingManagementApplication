import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Location } from '@angular/common';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-edit-parcel',
  templateUrl: './edit-parcel.page.html',
  styleUrls: ['./edit-parcel.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule
  ]
})
export class EditParcelPage implements OnInit {
  parcelId: string = '';
  parcelForm: FormGroup;
  loading: boolean = true;
  loadingError: boolean = false;
  saving: boolean = false;
  
  // Add injector for Firebase operations
  private injector = inject(Injector);

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
      try {
        // Use runInInjectionContext for Firestore query
        const doc = await runInInjectionContext(this.injector, () => {
          return firstValueFrom(
            this.firestore.collection('parcels').doc(this.parcelId).get()
          );
        });
        
        if (doc.exists) {
          const parcelData = doc.data() as any;
          this.parcelForm.patchValue({
            trackingId: parcelData.trackingId || '',
            date: parcelData.date || '',
            barcode: parcelData.barcode || '',
            pickupLocation: parcelData.pickupLocation || '',
            senderName: parcelData.senderName || '',
            senderContact: parcelData.senderContact || '',
            senderEmail: parcelData.senderEmail || '',
            senderAddress: parcelData.senderAddress || '',
            receiverName: parcelData.receiverName || '',
            receiverContact: parcelData.receiverContact || '',
            receiverEmail: parcelData.receiverEmail || '',
            receiverAddress: parcelData.receiverAddress || ''
          });
          this.loading = false;
        } else {
          this.loadingError = true;
          this.loading = false;
        }
      } catch (error) {
        console.error('Error fetching parcel:', error);
        this.loading = false;
        this.loadingError = true;
      }
    } else {
      this.loading = false;
      this.loadingError = true;
    }
    loading.dismiss();
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
        const updatedData = {
          senderName: this.parcelForm.get('senderName')?.value,
          senderContact: this.parcelForm.get('senderContact')?.value,
          senderEmail: this.parcelForm.get('senderEmail')?.value,
          senderAddress: this.parcelForm.get('senderAddress')?.value,
          receiverName: this.parcelForm.get('receiverName')?.value,
          receiverContact: this.parcelForm.get('receiverContact')?.value,
          receiverEmail: this.parcelForm.get('receiverEmail')?.value,
          receiverAddress: this.parcelForm.get('receiverAddress')?.value,
          updatedAt: new Date()
        };
  
        // Use runInInjectionContext for Firestore operation
        await runInInjectionContext(this.injector, () => {
          return this.firestore.collection('parcels').doc(this.parcelId).update(updatedData);
        });
  
        loading.dismiss();
        this.saving = false;
        
        // Show success toast
        const toast = await this.toastCtrl.create({
          message: 'Parcel updated successfully',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
        
        // Navigate back to manage parcels
        setTimeout(() => {
          this.router.navigate(['/manage-parcel']);
        }, 500);
      } catch (error) {
        console.error('Error updating parcel:', error);
        loading.dismiss();
        this.saving = false;
        
        // Show error toast
        const toast = await this.toastCtrl.create({
          message: 'Failed to update parcel. Please try again.',
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