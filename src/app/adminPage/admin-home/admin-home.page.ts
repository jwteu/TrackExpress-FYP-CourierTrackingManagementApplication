import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, inject, Injector, runInInjectionContext, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore'; // Add this import
import { Subscription } from 'rxjs'; // Add this import

@Component({
  selector: 'app-admin-home',
  templateUrl: './admin-home.page.html',
  styleUrls: ['./admin-home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AdminHomePage implements OnInit, OnDestroy { // Add OnDestroy
  userName: string = '';
  userRole: string = '';
  
  // Add properties for parcel stats
  pendingParcelsCount: number = 0;
  deliveredTodayCount: number = 0;
  activeDeliverymenCount: number = 0;
  
  // Add loading state properties
  loadingPending: boolean = true;
  loadingDelivered: boolean = true;
  loadingDeliverymen: boolean = true;
  
  // Add subscription properties
  private pendingSubscription: Subscription | null = null;
  private deliveredSubscription: Subscription | null = null;
  private deliverymenSubscription: Subscription | null = null;
  
  // Add injector and firestore
  private injector = inject(Injector);
  private firestore = inject(AngularFirestore);
  
  constructor(
    private router: Router,
    private afAuth: AngularFireAuth,
    private ngZone: NgZone // Add NgZone for change detection
  ) { }

  ngOnInit() {
    this.checkUserSession();
    this.loadStats(); // Add this call to load stats
  }
  
  ngOnDestroy() {
    // Clean up subscriptions
    this.pendingSubscription?.unsubscribe();
    this.deliveredSubscription?.unsubscribe();
    this.deliverymenSubscription?.unsubscribe();
  }

  checkUserSession() {
    // Existing code unchanged
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
  
  // Add method to load stats
  loadStats() {
    // Reset loading states
    this.loadingPending = true;
    this.loadingDelivered = true;
    this.loadingDeliverymen = true;
    
    try {
      // Wrap all Firestore operations in runInInjectionContext
      runInInjectionContext(this.injector, () => {
        // 1. Get pending parcels count
        this.pendingSubscription = this.firestore
          .collection('parcels', ref => ref.where('status', '!=', 'Delivered'))
          .valueChanges()
          .subscribe({
            next: (parcels) => {
              console.log('Pending parcels fetched:', parcels.length);
              this.ngZone.run(() => {
                this.pendingParcelsCount = parcels.length;
                this.loadingPending = false;
              });
            },
            error: (error) => {
              console.error('Error fetching pending parcels:', error);
              this.ngZone.run(() => {
                this.loadingPending = false;
              });
            }
          });
        
        // 2. Get delivered parcels
        this.deliveredSubscription = this.firestore
          .collection('parcels', ref => ref.where('status', '==', 'Delivered'))
          .valueChanges()
          .subscribe({
            next: (parcels) => {
              console.log('All delivered parcels fetched:', parcels.length);
              
              // Filter for today's deliveries client-side
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const todayParcels = parcels.filter((parcel: any) => {
                if (!parcel.createdAt) return false;
                
                let parcelDate;
                if (typeof parcel.createdAt === 'string') {
                  parcelDate = new Date(parcel.createdAt);
                } else if (parcel.createdAt.toDate) {
                  parcelDate = parcel.createdAt.toDate();
                } else {
                  return false;
                }
                
                return parcelDate >= today;
              });
              
              console.log('Delivered parcels today (client-filtered):', todayParcels.length);
              this.ngZone.run(() => {
                this.deliveredTodayCount = todayParcels.length;
                this.loadingDelivered = false;
              });
            },
            error: (error) => {
              console.error('Error fetching delivered parcels:', error);
              this.ngZone.run(() => {
                this.loadingDelivered = false;
              });
            }
          });
        
        // 3. Get active deliverymen count
        this.deliverymenSubscription = this.firestore
          .collection('users', ref => ref.where('role', '==', 'deliveryman'))
          .valueChanges()
          .subscribe({
            next: (users) => {
              console.log('Active deliverymen fetched:', users.length);
              this.ngZone.run(() => {
                this.activeDeliverymenCount = users.length;
                this.loadingDeliverymen = false;
              });
            },
            error: (error) => {
              console.error('Error fetching deliverymen:', error);
              this.ngZone.run(() => {
                this.loadingDeliverymen = false;
              });
            }
          });
      });
    } catch (error) {
      console.error('Error in loadStats:', error);
      this.ngZone.run(() => {
        this.loadingPending = false;
        this.loadingDelivered = false;
        this.loadingDeliverymen = false;
      });
    }
  }

  navigateTo(page: string) {
    this.router.navigate([page]);
  }

  async logout() {
    // Clean up subscriptions
    this.pendingSubscription?.unsubscribe();
    this.deliveredSubscription?.unsubscribe();
    this.deliverymenSubscription?.unsubscribe();
    
    localStorage.removeItem('userSession');
    
    try {
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