import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AddParcelPageRoutingModule } from './add-parcel-routing.module';
import { AddParcelPage } from './add-parcel.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AddParcelPageRoutingModule,
    AddParcelPage // Import the standalone component
  ]
})
export class AddParcelPageModule {}