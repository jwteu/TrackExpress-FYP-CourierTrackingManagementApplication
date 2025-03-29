import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Component({
  selector: 'app-manage-parcel',
  templateUrl: './manage-parcel.page.html',
  styleUrls: ['./manage-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ManageParcelPage implements OnInit {
  parcels: any[] = [];

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

  loadParcels() {
    this.firestore.collection('parcels', ref => ref.orderBy('createdAt', 'desc')).valueChanges({ idField: 'id' }).subscribe(data => {
      this.parcels = data;
    });
  }

  addParcel() {
    this.router.navigate(['/add-parcel']);
  }

  viewParcelDetail(id: string) {
    this.router.navigate(['/parcel-detail', id]);
  }

  editParcel(id: string) {
    // This would be implemented with a form to edit the parcel
    // For now, we'll just navigate to the detail page
    this.router.navigate(['/parcel-detail', id]);
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
            await this.firestore.collection('parcels').doc(id).delete();
            
            const toast = await this.toastController.create({
              message: 'Parcel deleted successfully',
              duration: 2000,
              color: 'success',
              position: 'bottom'
            });
            toast.present();
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