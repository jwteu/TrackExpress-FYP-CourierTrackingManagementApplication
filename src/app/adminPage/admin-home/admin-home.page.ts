import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { firstValueFrom } from 'rxjs';

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
  
  // Add injector for Firebase operations
  private injector = inject(Injector);
  
  constructor(
    private router: Router,
    private afAuth: AngularFireAuth
  ) { }

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
      
      if (!userSession.uid || !userSession.role || userSession.role !== 'admin') {
        this.logout();
        return;
      }
      
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

  async logout() {
    localStorage.removeItem('userSession');
    
    try {
      // Use runInInjectionContext for Firebase signOut
      await runInInjectionContext(this.injector, () => {
        return this.afAuth.signOut();
      });
      
      console.log('User signed out');
    } catch (error) {
      console.error('Sign out error:', error);
    }
    
    this.router.navigate(['/login']);
  }
}