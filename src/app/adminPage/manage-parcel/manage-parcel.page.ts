import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
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
    private firestore: AngularFirestore
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

  editParcel(id: string) {
    // Edit parcel logic here
  }

  deleteParcel(id: string) {
    this.firestore.collection('parcels').doc(id).delete();
  }

  goBack() {
    this.location.back();
  }
}