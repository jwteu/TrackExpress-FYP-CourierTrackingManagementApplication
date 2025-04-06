import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Location } from '@angular/common';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-parcel-detail',
  templateUrl: './parcel-detail.page.html',
  styleUrls: ['./parcel-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ParcelDetailPage implements OnInit {
  parcelId: string = '';
  parcel: any;
  loading = true;
  loadingError = false;

  // Add injector for Firebase operations
  private injector = inject(Injector);

  constructor(
    private route: ActivatedRoute,
    private firestore: AngularFirestore,
    private location: Location,
    private loadingController: LoadingController
  ) {}

  async ngOnInit() {
    const loading = await this.loadingController.create({
      message: 'Loading parcel details...',
      spinner: 'circles'
    });
    await loading.present();

    const id = this.route.snapshot.paramMap.get('id');
    this.parcelId = id ?? '';
    
    if (this.parcelId) {
      try {
        // Use runInInjectionContext for Firestore query
        const docSnapshot = await runInInjectionContext(this.injector, () => {
          return firstValueFrom(
            this.firestore.collection('parcels').doc(this.parcelId).get()
          );
        });
        
        if (docSnapshot.exists) {
          this.parcel = {
            id: docSnapshot.id,
            ...(docSnapshot.data() as Record<string, any>)
          };
          this.loading = false;
        } else {
          this.loadingError = true;
          this.loading = false;
        }
      } catch (error) {
        console.error('Error fetching parcel:', error);
        this.loadingError = true;
        this.loading = false;
      }
    } else {
      this.loadingError = true;
      this.loading = false;
    }
    
    loading.dismiss();
  }

  goBack() {
    this.location.back();
  }

  printParcel() {
    const printContent = this.preparePrintContent();
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      alert('Please allow pop-ups to print the parcel details.');
      return;
    }
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    printWindow.onload = function() {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  }

  preparePrintContent() {
    if (!this.parcel) {
      return '<p>No parcel data available to print.</p>';
    }
    
    const formattedDate = new Date(this.parcel.date).toLocaleDateString();
    
    // Create the print content with HTML formatting
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Parcel Details - ${this.parcel.trackingId}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; }
          .section { margin-bottom: 20px; border: 1px solid #eee; padding: 10px; }
          .section-title { font-weight: bold; background: #f8f8f8; padding: 5px; margin-bottom: 10px; }
          .barcode { text-align: center; margin: 20px 0; }
          .barcode img { max-width: 300px; }
          .field { margin-bottom: 5px; }
          .label { font-weight: bold; display: inline-block; width: 120px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Parcel Tracking Details</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="barcode">
          <img src="${this.parcel.barcode}" alt="Barcode">
          <p>${this.parcel.trackingId}</p>
        </div>
        
        <div class="section">
          <div class="section-title">Tracking Information</div>
          <div class="field"><span class="label">Tracking ID:</span> ${this.parcel.trackingId}</div>
          <div class="field"><span class="label">Status:</span> ${this.parcel.status || 'Processing'}</div>
          <div class="field"><span class="label">Date:</span> ${formattedDate}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Sender Information</div>
          <div class="field"><span class="label">Name:</span> ${this.parcel.senderName || 'N/A'}</div>
          <div class="field"><span class="label">Contact:</span> ${this.parcel.senderContact || 'N/A'}</div>
          <div class="field"><span class="label">Email:</span> ${this.parcel.senderEmail || 'N/A'}</div>
          <div class="field"><span class="label">Address:</span> ${this.parcel.senderAddress || 'N/A'}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Receiver Information</div>
          <div class="field"><span class="label">Name:</span> ${this.parcel.receiverName || 'N/A'}</div>
          <div class="field"><span class="label">Contact:</span> ${this.parcel.receiverContact || 'N/A'}</div>
          <div class="field"><span class="label">Email:</span> ${this.parcel.receiverEmail || 'N/A'}</div>
          <div class="field"><span class="label">Address:</span> ${this.parcel.receiverAddress || 'N/A'}</div>
        </div>
        
        <div class="section">
          <div class="section-title">Pickup Information</div>
          <div class="field"><span class="label">Location:</span> ${this.parcel.pickupLocation || 'N/A'}</div>
        </div>
      </body>
      </html>
    `;
  }
}