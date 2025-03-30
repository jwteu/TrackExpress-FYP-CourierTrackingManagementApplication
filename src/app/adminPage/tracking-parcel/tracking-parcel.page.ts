import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Component({
  selector: 'app-tracking-parcel',
  templateUrl: './tracking-parcel.page.html',
  styleUrls: ['./tracking-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule] // Ensure required modules are imported
})
export class TrackingParcelPage implements OnInit {
  trackingId: string = ''; // User-entered tracking ID
  parcel: any = null; // Parcel data fetched from Firestore
  loading: boolean = false; // Loading state
  searchPerformed: boolean = false; // Whether a search has been performed

  constructor(
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {}

  // Method to track a parcel by its tracking ID
  async trackParcel() {
    if (!this.trackingId || this.trackingId.trim() === '') {
      // Show a warning if the tracking ID is empty
      const toast = await this.toastController.create({
        message: 'Please enter a tracking ID',
        duration: 2000,
        color: 'warning',
        position: 'top'
      });
      toast.present();
      return;
    }

    this.searchPerformed = true;
    this.loading = true;
    this.parcel = null;

    // Show a loading spinner
    const loading = await this.loadingController.create({
      message: 'Searching for your parcel...',
      spinner: 'circles'
    });
    await loading.present();

    // Query Firestore for the parcel with the given tracking ID
    this.firestore.collection('parcels', ref =>
      ref.where('trackingId', '==', this.trackingId.trim())
    ).get().subscribe(snapshot => {
      loading.dismiss();
      this.loading = false;

      if (snapshot.empty) {
        // No parcel found
        this.parcel = null;
      } else {
        // Get the first matching parcel
        const doc = snapshot.docs[0];
        this.parcel = { id: doc.id, ...(doc.data() as Record<string, any>) }; // Explicitly type doc.data() as an object
      }
    }, error => {
      // Handle errors during the Firestore query
      loading.dismiss();
      this.loading = false;
      console.error('Error searching for parcel:', error);
      this.showErrorToast();
    });
  }

  // Show an error toast
  async showErrorToast() {
    const toast = await this.toastController.create({
      message: 'An error occurred while searching. Please try again.',
      duration: 3000,
      color: 'danger',
      position: 'top'
    });
    toast.present();
  }

  // Navigate to the parcel detail page
  viewParcelDetails(parcelId: string) {
    this.router.navigate(['/parcel-detail', parcelId]);
  }
}