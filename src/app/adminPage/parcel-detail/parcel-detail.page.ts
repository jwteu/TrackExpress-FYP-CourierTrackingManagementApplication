import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Location } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-parcel-detail',
  templateUrl: './parcel-detail.page.html',
  styleUrls: ['./parcel-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ParcelDetailPage implements OnInit {
  parcelId: string = ''; // Initialize with empty string to fix the null issue
  parcel: any;
  loading = true;
  loadingError = false;

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

    // Fix the null issue by using nullish coalescing operator
    const id = this.route.snapshot.paramMap.get('id');
    this.parcelId = id ?? '';
    
    if (this.parcelId) {
      this.firestore.collection('parcels').doc(this.parcelId).get().subscribe(
        doc => {
          if (doc.exists) {
            // Fix the spread issue by explicitly typing the data
            const data = doc.data() as Record<string, any>;
            this.parcel = { id: doc.id, ...data };
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

  printParcel() {
    const printContent = this.preparePrintContent();
    const printWindow = window.open('', '_blank');
    
    // Check if printWindow is null (could happen if pop-ups are blocked)
    if (!printWindow) {
      // Alert the user that the pop-up was blocked
      alert('Please allow pop-ups for this website to print parcel details.');
      return;
    }
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for images to load before printing
    printWindow.onload = function() {
      printWindow.print();
    };
  }

  preparePrintContent() {
    if (!this.parcel) return '';
    
    // Format date properly
    const formattedDate = new Date(this.parcel.date).toLocaleDateString();
  
    // Create a professional looking print layout
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Parcel Details - ${this.parcel.trackingId}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            line-height: 1.5;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #ccc;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .section {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px dashed #ccc;
          }
          .section h3 {
            margin-bottom: 10px;
            color: #333;
          }
          .row {
            display: flex;
            margin-bottom: 10px;
          }
          .label {
            width: 150px;
            font-weight: bold;
          }
          .value {
            flex: 1;
          }
          .barcode {
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background-color: white;
            border: 1px solid #ddd;
          }
          .barcode img {
            width: 80%;
            max-width: 400px;
            height: auto;
          }
          .barcode p {
            font-size: 20px;
            font-weight: bold;
            margin-top: 10px;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
          }
          @media print {
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>TrackExpress Courier Service</h2>
            <h3>Parcel Tracking Information</h3>
          </div>
          
          <div class="section">
            <h3>Tracking Details</h3>
            <div class="row">
              <div class="label">Tracking ID:</div>
              <div class="value">${this.parcel.trackingId}</div>
            </div>
            <div class="row">
              <div class="label">Date:</div>
              <div class="value">${formattedDate}</div>
            </div>
          </div>
          
          <div class="barcode">
            <img src="${this.parcel.barcode}" alt="Barcode">
            <p>${this.parcel.trackingId}</p>
          </div>
          
          <div class="section">
            <h3>Sender Information</h3>
            <div class="row">
              <div class="label">Name:</div>
              <div class="value">${this.parcel.senderName}</div>
            </div>
            <div class="row">
              <div class="label">Contact:</div>
              <div class="value">${this.parcel.senderContact}</div>
            </div>
            <div class="row">
              <div class="label">Email:</div>
              <div class="value">${this.parcel.senderEmail}</div>
            </div>
            <div class="row">
              <div class="label">Address:</div>
              <div class="value">${this.parcel.senderAddress}</div>
            </div>
          </div>
          
          <div class="section">
            <h3>Receiver Information</h3>
            <div class="row">
              <div class="label">Name:</div>
              <div class="value">${this.parcel.receiverName}</div>
            </div>
            <div class="row">
              <div class="label">Contact:</div>
              <div class="value">${this.parcel.receiverContact}</div>
            </div>
            <div class="row">
              <div class="label">Email:</div>
              <div class="value">${this.parcel.receiverEmail}</div>
            </div>
            <div class="row">
              <div class="label">Address:</div>
              <div class="value">${this.parcel.receiverAddress}</div>
            </div>
          </div>
          
          <div class="section">
            <h3>Pickup Information</h3>
            <div class="row">
              <div class="label">Pickup Location:</div>
              <div class="value">${this.parcel.pickupLocation}</div>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an official document of TrackExpress Courier Service.</p>
            <p>Printed on: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}