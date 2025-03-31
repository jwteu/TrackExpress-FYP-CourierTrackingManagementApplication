import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-deliveryman-home',
  templateUrl: './deliveryman-home.page.html',
  styleUrls: ['./deliveryman-home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DeliverymanHomePage implements OnInit {
  userName: string = '';

  constructor(
    private router: Router,
    private afAuth: AngularFireAuth
  ) {}

  ngOnInit() {
    this.checkUserSession();
  }

  checkUserSession() {
    const sessionData = localStorage.getItem('userSession');
    
    if (!sessionData) {
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      
      if (!userSession.uid || userSession.role !== 'deliveryman') {
        this.logout();
        return;
      }
      
      this.userName = userSession.name || '';
    } catch (error) {
      console.error('Error parsing user session:', error);
      this.logout();
    }
  }

  navigateTo(page: string) {
    this.router.navigate([page]);
  }

  logout() {
    localStorage.removeItem('userSession');
    this.afAuth.signOut().then(() => {
      console.log('User signed out');
      this.router.navigate(['/login']);
    }).catch(error => {
      console.error('Sign out error:', error);
      this.router.navigate(['/login']);
    });
  }
}