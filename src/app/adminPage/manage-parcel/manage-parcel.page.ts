import { Component, OnInit, OnDestroy, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subscription } from 'rxjs';

// Define interface for parcel type
interface Parcel {
  id?: string;
  trackingId?: string;
  senderName?: string;
  date?: string;
  status?: string;
  photoURL?: string;
  barcode?: string;
  createdAt?: any;
}

@Component({
  selector: 'app-manage-parcel',
  templateUrl: './manage-parcel.page.html',
  styleUrls: ['./manage-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ManageParcelPage implements OnInit, OnDestroy {
  parcels: Parcel[] = [];
  loading: boolean = true;
  private parcelsSubscription: Subscription | null = null;
  
  // Add injector for Firebase operations
  private injector = inject(Injector);

  constructor(
    private location: Location,
    private router: Router,
    private firestore: AngularFirestore,
    private alertController: AlertController,
    private toastController: ToastController
  ) { }

  ngOnInit() {
    this.loadParcels();
  }

  ngOnDestroy() {
    // Clean up subscription when component is destroyed
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
  }

  ionViewWillEnter() {
    // Only load if we don't already have an active subscription
    if (!this.parcelsSubscription) {
      this.loadParcels();
    }
  }

  loadParcels() {
    // Clean up any existing subscription
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    
    this.loading = true;
    
    // Use runInInjectionContext with a subscription to get real-time updates
    runInInjectionContext(this.injector, () => {
      this.parcelsSubscription = this.firestore
        .collection<Parcel>('parcels', ref => ref.orderBy('createdAt', 'desc'))
        .valueChanges({ idField: 'id' })
        .subscribe({
          next: (parcelsSnapshot) => {
            console.log('Received parcels:', parcelsSnapshot.length);
            
            // Filter out parcels that are already delivered or have photo verification
            const activeParcels = parcelsSnapshot.filter(parcel => 
              parcel.status !== 'Delivered' && 
              !parcel.photoURL
            );
            
            console.log('Active parcels (excluding delivered):', activeParcels.length);
            this.parcels = activeParcels;
            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading parcels:', error);
            this.loading = false;
            this.showErrorToast('Failed to load parcels. Please try again.');
          }
        });
    });
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'danger',
      position: 'bottom'
    });
    toast.present();
  }

  addParcel() {
    this.router.navigate(['/add-parcel']);
  }

  viewParcelDetail(id: string) {
    this.router.navigate(['/parcel-detail', id]);
  }

  editParcel(id: string) {
    this.router.navigate(['/edit-parcel', id]);
  }

  async deleteParcel(id: string) {
    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: 'Are you sure you want to delete this parcel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, {
          text: 'Delete',
          handler: async () => {
            try {
              // Use runInInjectionContext for Firestore operation
              await runInInjectionContext(this.injector, () => {
                return this.firestore.collection('parcels').doc(id).delete();
              });
              
              const toast = await this.toastController.create({
                message: 'Parcel deleted successfully',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              toast.present();
              
              // No need to manually reload - the subscription will handle it
            } catch (error) {
              console.error('Error deleting parcel:', error);
              const toast = await this.toastController.create({
                message: 'Failed to delete parcel',
                duration: 2000,
                color: 'danger',
                position: 'bottom'
              });
              toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
  }

  goBack() {
    this.router.navigate(['/admin-home']);
  }
}