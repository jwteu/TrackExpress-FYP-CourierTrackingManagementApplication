import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import * as JsBarcode from 'jsbarcode';

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
    public router: Router
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

  ngOnInit() {}

  async submit() {
    if (this.parcelForm.valid) {
      const trackingId = this.generateTrackingId();
      const barcodeId = uuidv4(); // Generate a separate unique ID for the barcode
      const barcode = this.generateBarcode(barcodeId);
      const parcelData = {
        ...this.parcelForm.value,
        trackingId,
        barcode,
        createdAt: new Date()
      };

      await this.firestore.collection('parcels').add(parcelData);
      this.router.navigate(['/manage-parcel']);
    }
  }

  generateTrackingId(): string {
    // Implement your own logic to generate a unique tracking ID
    return 'TRK-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  generateBarcode(barcodeId: string): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, barcodeId, { format: 'CODE128' });
    return canvas.toDataURL('image/png');
  }

  goBack() {
    this.router.navigate(['/manage-parcel']);
  }
}