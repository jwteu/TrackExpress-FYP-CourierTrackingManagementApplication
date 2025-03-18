import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-admin-home',
  templateUrl: './admin-home.page.html',
  styleUrls: ['./admin-home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AdminHomePage implements OnInit {
  userName: string = '';
  userRole: string = '';
  
  constructor(
    private router: Router,
    private afAuth: AngularFireAuth
  ) { }

  ngOnInit() {
    this.checkUserSession();
  }

  checkUserSession() {
    // Get user session from localStorage
    const sessionData = localStorage.getItem('userSession');
    
    if (!sessionData) {
      // No session found, redirect to login
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      
      // Validate session data
      if (!userSession.uid || !userSession.role || userSession.role !== 'admin') {
        // Invalid session or not an admin, redirect to login
        this.logout();
        return;
      }
      
      // Session is valid, set user information
      this.userName = userSession.name || '';
      this.userRole = userSession.role;
      
    } catch (error) {
      console.error('Error parsing user session:', error);
      this.logout();
    }
  }

  navigateTo(page: string) {
    this.router.navigate([page]);
  }

  logout() {
    // Clear user session
    localStorage.removeItem('userSession');
    
    // Sign out from Firebase Auth
    this.afAuth.signOut().then(() => {
      console.log('User signed out');
      this.router.navigate(['/login']);
    }).catch(error => {
      console.error('Sign out error:', error);
      this.router.navigate(['/login']);
    });
  }
}