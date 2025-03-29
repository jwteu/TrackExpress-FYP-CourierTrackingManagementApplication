import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { EditParcelPageRoutingModule } from './edit-parcel-routing.module';
import { EditParcelPage } from './edit-parcel.page'; // Import the standalone component

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    EditParcelPageRoutingModule,
    EditParcelPage // Import the standalone component here
  ]
})
export class EditParcelPageModule {}