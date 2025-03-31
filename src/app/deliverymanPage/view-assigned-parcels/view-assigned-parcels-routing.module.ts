import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ViewAssignedParcelsPage } from './view-assigned-parcels.page';

const routes: Routes = [
  {
    path: '',
    component: ViewAssignedParcelsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ViewAssignedParcelsPageRoutingModule {}
