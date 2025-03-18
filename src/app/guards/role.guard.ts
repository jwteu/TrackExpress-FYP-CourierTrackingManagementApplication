import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  
  constructor(private router: Router) {}
  
  canActivate(route: ActivatedRouteSnapshot): boolean {
    // Get user session from localStorage
    const sessionData = localStorage.getItem('userSession');
    
    if (!sessionData) {
      // No session found, redirect to login
      this.router.navigate(['/login']);
      return false;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      const requiredRole = route.data['role'] as string;
      
      // Validate session data and role
      if (!userSession.uid || !userSession.role || userSession.role !== requiredRole) {
        // Invalid session or not the right role
        if (userSession.role === 'admin') {
          this.router.navigate(['/admin-home']);
        } else if (userSession.role === 'deliveryman') {
          this.router.navigate(['/deliveryman-home']);
        } else {
          localStorage.removeItem('userSession');
          this.router.navigate(['/login']);
        }
        return false;
      }
      
      // Session is valid and role matches
      return true;
      
    } catch (error) {
      console.error('Error parsing user session:', error);
      localStorage.removeItem('userSession');
      this.router.navigate(['/login']);
      return false;
    }
  }
}