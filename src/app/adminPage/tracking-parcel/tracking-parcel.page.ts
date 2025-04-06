import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-tracking-parcel',
  templateUrl: './tracking-parcel.page.html',
  styleUrls: ['./tracking-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class TrackingParcelPage implements OnInit {
  trackingId: string = '';
  parcel: any = null;
  loading: boolean = false;
  searchPerformed: boolean = false;
  
  // Add injector for Firebase operations
  private injector = inject(Injector);

  constructor(
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController
  ) {}

  ngOnInit() {}

  async trackParcel() {
    if (!this.trackingId || this.trackingId.trim() === '') {
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

    const loading = await this.loadingController.create({
      message: 'Searching for your parcel...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      // Use runInInjectionContext for Firestore operations
      const snapshot = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(
          this.firestore.collection('parcels', ref =>
            ref.where('trackingId', '==', this.trackingId.trim())
          ).get()
        );
      });

      loading.dismiss();
      this.loading = false;

      if (snapshot.empty) {
        this.parcel = null;
      } else {
        const doc = snapshot.docs[0];
        this.parcel = { id: doc.id, ...(doc.data() as Record<string, any>) };
      }
    } catch (error) {
      loading.dismiss();
      this.loading = false;
      console.error('Error searching for parcel:', error);
      this.showErrorToast();
    }
  }

  async showErrorToast() {
    const toast = await this.toastController.create({
      message: 'An error occurred while searching. Please try again.',
      duration: 3000,
      color: 'danger',
      position: 'top'
    });
    toast.present();
  }

  viewParcelDetails(parcelId: string) {
    this.router.navigate(['/parcel-detail', parcelId]);
  }
}