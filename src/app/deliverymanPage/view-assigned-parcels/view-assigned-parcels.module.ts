import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ViewAssignedParcelsPageRoutingModule } from './view-assigned-parcels-routing.module';
import { ViewAssignedParcelsPage } from './view-assigned-parcels.page';
import { ParcelService } from '../../services/parcel.service';
import { GeocodingService } from '../../services/geocoding.service';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ViewAssignedParcelsPageRoutingModule,
    ViewAssignedParcelsPage
  ],
  declarations: [],
  providers: [ParcelService, GeocodingService]
})
export class ViewAssignedParcelsPageModule {}
