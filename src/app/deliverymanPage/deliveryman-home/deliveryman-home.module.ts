import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { DeliverymanHomePageRoutingModule } from './deliveryman-home-routing.module';
import { DeliverymanHomePage } from './deliveryman-home.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DeliverymanHomePageRoutingModule,
    DeliverymanHomePage // import standalone component here
  ]
})
export class DeliverymanHomePageModule {}
