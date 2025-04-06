import { Component, OnInit, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-manage-parcel',
  templateUrl: './manage-parcel.page.html',
  styleUrls: ['./manage-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ManageParcelPage implements OnInit {
  parcels: any[] = [];
  
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

  ionViewWillEnter() {
    this.loadParcels();
  }

  async loadParcels() {
    try {
      // Use firstValueFrom instead of direct subscription
      const parcelsSnapshot = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(
          this.firestore.collection('parcels', ref => ref.orderBy('createdAt', 'desc'))
            .valueChanges({ idField: 'id' })
        );
      });
      
      this.parcels = parcelsSnapshot;
    } catch (error) {
      console.error('Error loading parcels:', error);
    }
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
              
              // Refresh the parcels list
              this.loadParcels();
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