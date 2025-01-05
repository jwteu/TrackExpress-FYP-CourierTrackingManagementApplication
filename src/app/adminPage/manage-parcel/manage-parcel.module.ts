// filepath: /c:/Users/teuji/courier-tracking/src/app/adminPage/manage-parcel/manage-parcel.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ManageParcelPageRoutingModule } from './manage-parcel-routing.module';
import { ManageParcelPage } from './manage-parcel.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ManageParcelPageRoutingModule,
    ManageParcelPage // Import the standalone component
  ]
})
export class ManageParcelPageModule {}