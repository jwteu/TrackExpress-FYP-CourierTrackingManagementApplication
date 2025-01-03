import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DeliverymanHomePage } from './deliveryman-home.page';

const routes: Routes = [
  {
    path: '',
    component: DeliverymanHomePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DeliverymanHomePageRoutingModule {}
