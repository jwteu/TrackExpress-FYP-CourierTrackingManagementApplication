import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ViewAssignedParcelsPageRoutingModule } from './view-assigned-parcels-routing.module';
import { ViewAssignedParcelsPage } from './view-assigned-parcels.page'; // Import the standalone component

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ViewAssignedParcelsPageRoutingModule,
    ViewAssignedParcelsPage // Import the standalone component here
  ],
})
export class ViewAssignedParcelsPageModule {}