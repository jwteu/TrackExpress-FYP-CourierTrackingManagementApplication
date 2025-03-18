
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(private router: Router) {}
  
  canActivate(): boolean {
    // Get user session from localStorage
    const sessionData = localStorage.getItem('userSession');
    
    if (!sessionData) {
      // No session found, redirect to login
      this.router.navigate(['/login']);
      return false;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      
      // Validate session data
      if (!userSession.uid || !userSession.role) {
        // Invalid session, redirect to login
        localStorage.removeItem('userSession');
        this.router.navigate(['/login']);
        return false;
      }
      
      // Session is valid
      return true;
      
    } catch (error) {
      console.error('Error parsing user session:', error);
      localStorage.removeItem('userSession');
      this.router.navigate(['/login']);
      return false;
    }
  }
}