import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ParcelDetailPageRoutingModule } from './parcel-detail-routing.module';
import { ParcelDetailPage } from './parcel-detail.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ParcelDetailPageRoutingModule,
    ParcelDetailPage // Import the standalone component
  ],
  declarations: []  // Remove the component from declarations as it's standalone
})
export class ParcelDetailPageModule {}