import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TrackingParcelPageRoutingModule } from './tracking-parcel-routing.module';

import { TrackingParcelPage } from './tracking-parcel.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TrackingParcelPageRoutingModule
  ],
  declarations: []
})
export class TrackingParcelPageModule {}