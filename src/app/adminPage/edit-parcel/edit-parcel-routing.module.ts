import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EditParcelPage } from './edit-parcel.page';

const routes: Routes = [
  {
    path: '',
    component: EditParcelPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditParcelPageRoutingModule {}