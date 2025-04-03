import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('./pages/signup/signup.module').then( m => m.SignupPageModule)
  },
  {
    path: 'reset-password',
    loadChildren: () => import('./pages/reset-password/reset-password.module').then( m => m.ResetPasswordPageModule)
  },
  {
    path: 'landing',
    loadChildren: () => import('./pages/landing/landing.module').then( m => m.LandingPageModule)
  },
  {
    path: 'admin-home',
    loadChildren: () => import('./adminPage/admin-home/admin-home.module').then(m => m.AdminHomePageModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'admin' }
  },
  // For deliveryman routes:
  {
    path: 'deliveryman-home',
    loadChildren: () => import('./deliverymanPage/deliveryman-home/deliveryman-home.module').then(m => m.DeliverymanHomePageModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'deliveryman' }
  },
  {
    path: 'manage-parcel',
    loadChildren: () => import('./adminPage/manage-parcel/manage-parcel.module').then( m => m.ManageParcelPageModule)
  },
  {
    path: 'add-parcel',
    loadChildren: () => import('./adminPage/add-parcel/add-parcel.module').then( m => m.AddParcelPageModule)
  },
  // Update this route to match the correct path
  {
    path: 'profile',
    loadChildren: () => import('./adminPage/profile/profile.module').then(m => m.ProfilePageModule),
    canActivate: [AuthGuard] // Only authenticated users can access the profile
  },
  // Update the parcel-detail route to accept a parameter
{
  path: 'parcel-detail/:id',
  loadChildren: () => import('./adminPage/parcel-detail/parcel-detail.module').then(m => m.ParcelDetailPageModule)
},
  // Replace the edit-parcel route with:
{
  path: 'edit-parcel/:id',
  loadChildren: () => import('./adminPage/edit-parcel/edit-parcel.module').then( m => m.EditParcelPageModule)
},  {
    path: 'tracking-parcel',
    loadChildren: () => import('./adminPage/tracking-parcel/tracking-parcel.module').then( m => m.TrackingParcelPageModule)
  },
  {
    path: 'view-assigned-parcels',
    loadChildren: () => import('./deliverymanPage/view-assigned-parcels/view-assigned-parcels.module').then( m => m.ViewAssignedParcelsPageModule)
  },
  {
    path: 'take-photo',
    loadChildren: () => import('./deliverymanPage/take-photo/take-photo.module').then( m => m.TakePhotoPageModule)
  }



];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }