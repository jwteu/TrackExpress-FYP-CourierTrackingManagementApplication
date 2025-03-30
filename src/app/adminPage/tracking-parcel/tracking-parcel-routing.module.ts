import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TrackingParcelPage } from './tracking-parcel.page';

const routes: Routes = [
  {
    path: '',
    component: TrackingParcelPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TrackingParcelPageRoutingModule {}