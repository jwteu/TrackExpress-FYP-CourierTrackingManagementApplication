import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddParcelPage } from './add-parcel.page';

const routes: Routes = [
  {
    path: '',
    component: AddParcelPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddParcelPageRoutingModule {}
