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

    // Create a professional looking print layout optimized for a single page
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Parcel Details - ${this.parcel.trackingId}</title>
        <style>
          @page {
            size: A4;
            margin: 0.5cm;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 10px;
            line-height: 1.3;
            font-size: 11pt;
          }
          .container {
            max-width: 100%;
            margin: 0 auto;
            border: 1px solid #ccc;
            padding: 10px;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #333;
            padding-bottom: 5px;
          }
          .header h2 {
            margin: 5px 0;
          }
          .header h3 {
            margin: 5px 0;
          }
          .section {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ccc;
          }
          .section h3 {
            margin: 5px 0;
            color: #333;
            font-size: 12pt;
          }
          .row {
            display: flex;
            margin-bottom: 5px;
          }
          .label {
            width: 140px;
            font-weight: bold;
          }
          .value {
            flex: 1;
          }
          .barcode {
            text-align: center;
            margin: 10px 0;
            padding: 10px;
            background-color: white;
            border: 1px solid #ddd;
          }
          .barcode img {
            width: 70%;
            max-width: 300px;
            height: auto;
          }
          .barcode p {
            font-size: 14pt;
            font-weight: bold;
            margin: 5px 0 0 0;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            font-size: 9pt;
            color: #666;
          }
          .columns {
            display: flex;
            gap: 20px;
          }
          .column {
            flex: 1;
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
          
          <div class="columns">
            <div class="column">
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
            </div>
            
            <div class="column">
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