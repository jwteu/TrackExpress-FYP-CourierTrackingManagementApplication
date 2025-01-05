import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ManageParcelPage } from './manage-parcel.page';

const routes: Routes = [
  {
    path: '',
    component: ManageParcelPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ManageParcelPageRoutingModule {}
