import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, Platform, AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Location } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

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
    private loadingController: LoadingController,
    public platform: Platform, // Added public platform
    private alertController: AlertController
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

  async generatePDF(): Promise<Blob> {
    if (!this.parcel) {
      throw new Error('Parcel data is not available.');
    }
    const doc = new jsPDF();
    
    // Set document properties
    doc.setProperties({
      title: `Parcel Details - ${this.parcel.trackingId}`,
      subject: 'Parcel Tracking Information',
      author: 'TrackExpress',
      creator: 'TrackExpress Courier System'
    });
    
    // Add header with company logo/name
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 128); // Dark blue
    doc.text('TrackXpress', 105, 20, { align: 'center' });
    
    // Add title
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0); // Black
    doc.text('Parcel Details', 105, 30, { align: 'center' });
    
    // Add generated date
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 105, 38, { align: 'center' });
    
    // Add barcode image if available - make it prominent
    if (this.parcel.barcode) {
      try {
        const img = new Image();
        img.src = this.parcel.barcode;
        
        // Wait for image to load
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (err) => reject(err);
        });
        
        // Add the barcode image - larger size, centered
        doc.addImage(img, 'PNG', 55, 45, 100, 40);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(this.parcel.trackingId, 105, 95, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } catch (error) {
        console.error('Error adding barcode image:', error);
        // If image fails, just add tracking ID as text
        doc.text(`Tracking ID: ${this.parcel.trackingId}`, 20, 50);
      }
    } else {
      // No barcode, just add tracking ID as text
      doc.text(`Tracking ID: ${this.parcel.trackingId}`, 20, 50);
    }
    
    // Tracking Information Section
    let yPosition = 105; // Start position after barcode
    
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPosition, 182, 10, 'F');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128); // Dark blue for section headers
    doc.text('Tracking Information', 20, yPosition + 7);
    doc.setTextColor(0, 0, 0); // Reset to black
    doc.setFontSize(12);
    
    yPosition += 15;
    doc.text(`Status: ${this.parcel.status || 'Processing'}`, 20, yPosition);
    
    yPosition += 10;
    const formattedDate = this.parcel.date ? new Date(this.parcel.date).toLocaleDateString() : 'N/A';
    doc.text(`Date: ${formattedDate}`, 20, yPosition);
    
    // Sender Information Section
    yPosition += 20;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPosition, 182, 10, 'F');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128);
    doc.text('Sender Information', 20, yPosition + 7);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    
    yPosition += 15;
    doc.text(`Name: ${this.parcel.senderName || 'N/A'}`, 20, yPosition);
    
    yPosition += 10;
    doc.text(`Contact: ${this.parcel.senderContact || 'N/A'}`, 20, yPosition);
    
    yPosition += 10;
    doc.text(`Email: ${this.parcel.senderEmail || 'N/A'}`, 20, yPosition);
    
    // Handle long addresses with text wrapping
    yPosition += 10;
    const senderAddress = this.parcel.senderAddress || 'N/A';
    const senderAddressLines = doc.splitTextToSize(
      `Address: ${senderAddress}`, 170
    );
    doc.text(senderAddressLines, 20, yPosition);
    
    // Calculate Y position for next section based on number of address lines
    yPosition += 10 + ((senderAddressLines.length - 1) * 10);
    
    // Receiver Information Section
    yPosition += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPosition, 182, 10, 'F');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128);
    doc.text('Receiver Information', 20, yPosition + 7);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    
    yPosition += 15;
    doc.text(`Name: ${this.parcel.receiverName || 'N/A'}`, 20, yPosition);
    
    yPosition += 10;
    doc.text(`Contact: ${this.parcel.receiverContact || 'N/A'}`, 20, yPosition);
    
    yPosition += 10;
    doc.text(`Email: ${this.parcel.receiverEmail || 'N/A'}`, 20, yPosition);
    
    // Handle long addresses with text wrapping
    yPosition += 10;
    const receiverAddress = this.parcel.receiverAddress || 'N/A';
    const receiverAddressLines = doc.splitTextToSize(
      `Address: ${receiverAddress}`, 170
    );
    doc.text(receiverAddressLines, 20, yPosition);
    
    // Add a second page if needed
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition += 10 + ((receiverAddressLines.length - 1) * 10);
    }
    
    // Pickup Information Section
    yPosition += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, yPosition, 182, 10, 'F');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 128);
    doc.text('Pickup Information', 20, yPosition + 7);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    
    yPosition += 15;
    doc.text(`Location: ${this.parcel.pickupLocation || 'N/A'}`, 20, yPosition);
    
    // Add a footer with page number
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `TrackExpress - Page ${i} of ${pageCount}`,
        105, 290, { align: 'center' }
      );
    }
    
    // Return the PDF as a blob
    return doc.output('blob');
  }

  async generateAndSharePDF() {
    if (!this.parcel) {
      this.showAlert('Error', 'Parcel data is not available.');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Generating PDF...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      const pdfBlob = await this.generatePDF();

      if (Capacitor.isNativePlatform()) {
        // Save blob to a temporary file
        const fileName = `parcel_${this.parcel.trackingId}_${Date.now()}.pdf`;

        // Filesystem.writeFile expects data as string (base64) or Blob.
        // Let's convert Blob to base64 string for wider compatibility with Filesystem plugin.
        const base64Data = await this.blobToPureBase64(pdfBlob);

        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        await loading.dismiss();

        // Share the file URI
        await Share.share({
          title: `Parcel ${this.parcel.trackingId} Details`,
          text: 'Here are your parcel details as a PDF.',
          url: result.uri,
          dialogTitle: 'Share Parcel PDF'
        });

      } else {
        // Desktop: open the PDF in a new tab for viewing/printing
        await loading.dismiss();
        const blobUrl = URL.createObjectURL(pdfBlob);
        const newTab = window.open(blobUrl, '_blank');
        if (!newTab) {
          this.showAlert('Popup Blocked', 'Please allow pop-ups to view the PDF.');
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch (error: any) {
      console.error('Error generating or sharing PDF:', error);
      await loading.dismiss();
      this.showAlert(
        'PDF Error',
        `There was an error: ${error.message || String(error)}`
      );
    }
  }

  // Helper method to convert Blob to a pure base64 string (without data URI prefix)
  private blobToPureBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64String = dataUrl.substring(dataUrl.indexOf(',') + 1);
        resolve(base64String);
      };
      reader.readAsDataURL(blob);
    });
  }
  
  // Helper method for showing alerts
  private async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }
}