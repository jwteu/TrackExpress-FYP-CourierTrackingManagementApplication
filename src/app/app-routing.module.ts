import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

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
    loadChildren: () => import('./adminPage/admin-home/admin-home.module').then( m => m.AdminHomePageModule)
  },
  {
    path: 'deliveryman-home',
    loadChildren: () => import('./deliverymanPage/deliveryman-home/deliveryman-home.module').then( m => m.DeliverymanHomePageModule)
  },
  {
    path: 'manage-parcel',
    loadChildren: () => import('./adminPage/manage-parcel/manage-parcel.module').then( m => m.ManageParcelPageModule)
  },
  {
    path: 'add-parcel',
    loadChildren: () => import('./adminPage/add-parcel/add-parcel.module').then( m => m.AddParcelPageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
