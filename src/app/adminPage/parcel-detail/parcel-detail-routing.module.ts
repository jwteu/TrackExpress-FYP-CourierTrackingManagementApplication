import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ParcelDetailPage } from './parcel-detail.page';

const routes: Routes = [
  {
    path: '',
    component: ParcelDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ParcelDetailPageRoutingModule {}