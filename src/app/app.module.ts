import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { environment } from '../environments/environment'; 

import { CloudinaryService } from './services/cloudinary.service';
import { LocationAccuracy } from '@awesome-cordova-plugins/location-accuracy/ngx';

@NgModule({
  declarations: [], 
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    AppComponent,
    AngularFireModule.initializeApp(environment.firebaseConfig),
    AngularFireAuthModule,
    AngularFirestoreModule
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    CloudinaryService,
    LocationAccuracy
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
