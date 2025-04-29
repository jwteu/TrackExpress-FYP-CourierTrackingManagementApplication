import { Component, OnInit, OnDestroy, inject, Injector, runInInjectionContext, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ModalController, IonModal } from '@ionic/angular';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Subscription } from 'rxjs';

// Define interface for parcel type
interface Parcel {
  id?: string;
  trackingId?: string;
  senderName?: string;
  date?: string;
  status?: string;
  photoURL?: string;
  barcode?: string;
  createdAt?: any;
}

@Component({
  selector: 'app-manage-parcel',
  templateUrl: './manage-parcel.page.html',
  styleUrls: ['./manage-parcel.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ManageParcelPage implements OnInit, OnDestroy {
  parcels: Parcel[] = [];
  filteredParcels: Parcel[] = [];
  loading: boolean = true;
  searchQuery: string = '';
  private parcelsSubscription: Subscription | null = null;
  
  // Add injector for Firebase operations
  private injector = inject(Injector);

  @ViewChild('filterModal') filterModal!: IonModal;
  statusFilter: string | null = null;
  dateFilter: string | null = null;
  filterCount: number = 0;

  constructor(
    private location: Location,
    private router: Router,
    private firestore: AngularFirestore,
    private alertController: AlertController,
    private toastController: ToastController
  ) { }

  ngOnInit() {
    this.loadParcels();
  }

  ngOnDestroy() {
    // Clean up subscription when component is destroyed
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
  }

  ionViewWillEnter() {
    // Only load if we don't already have an active subscription
    if (!this.parcelsSubscription) {
      this.loadParcels();
    }
  }

  loadParcels() {
    // Clean up any existing subscription
    if (this.parcelsSubscription) {
      this.parcelsSubscription.unsubscribe();
    }
    
    this.loading = true;
    
    // Use runInInjectionContext with a subscription to get real-time updates
    runInInjectionContext(this.injector, () => {
      this.parcelsSubscription = this.firestore
        .collection<Parcel>('parcels', ref => ref.orderBy('createdAt', 'desc'))
        .valueChanges({ idField: 'id' })
        .subscribe({
          next: (parcelsSnapshot) => {
            console.log('Received parcels:', parcelsSnapshot.length);
            
            // Filter out parcels that are already delivered or have photo verification
            const activeParcels = parcelsSnapshot.filter(parcel => 
              parcel.status !== 'Delivered' && 
              !parcel.photoURL
            );
            
            console.log('Active parcels (excluding delivered):', activeParcels.length);
            this.parcels = activeParcels;
            
            // Debug status values
            this.parcels.forEach(parcel => {
              console.log(`Parcel status: "${parcel.status}", Class: "status-${(parcel.status || 'pending').toLowerCase().replace(/ /g, '-')}"`);
            });

            // Add detailed status debugging
            console.log('Parcel status summary:');
            const statusCounts = {};
            this.parcels.forEach(parcel => {
              const status = parcel.status || 'pending';
              statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            console.log(statusCounts);

            // Apply any existing search filter or reset to show all
            if (this.searchQuery && this.searchQuery.trim() !== '') {
              this.performSearch();
            } else {
              this.filteredParcels = [...this.parcels];
            }
            
            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading parcels:', error);
            this.loading = false;
            this.showErrorToast('Failed to load parcels. Please try again.');
          }
        });
    });
  }

  presentFilterModal() {
    this.filterModal.present();
  }

  applyFilters() {
    this.filterCount = 0;
    if (this.statusFilter) this.filterCount++;
    if (this.dateFilter) this.filterCount++;
    
    this.applySearchAndFilters();
  }

  clearStatusFilter() {
    this.statusFilter = null;
    this.applyFilters();
  }

  clearDateFilter() {
    this.dateFilter = null;
    this.applyFilters();
  }

  clearAllFilters() {
    this.statusFilter = null;
    this.dateFilter = null;
    this.filterCount = 0;
    this.applySearchAndFilters();
  }

  hasActiveFilters(): boolean {
    return this.statusFilter !== null || this.dateFilter !== null;
  }

  // This method ensures search works correctly with the data already shown
  performSearch() {
    this.applySearchAndFilters();
  }

  clearSearch() {
    this.searchQuery = '';
    this.applySearchAndFilters();
  }

  // New method that handles both search and filters
  applySearchAndFilters() {
    // Start with all parcels
    let results = [...this.parcels];
    
    // Apply search if there's a query
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase().trim();
      results = results.filter(parcel => {
        const trackingIdMatch = parcel.trackingId?.toLowerCase().includes(query);
        const senderNameMatch = parcel.senderName?.toLowerCase().includes(query);
        return trackingIdMatch || senderNameMatch;
      });
    }
    
    // Apply status filter with case-insensitive comparison and null handling
    if (this.statusFilter) {
      const filterStatus = this.statusFilter.toLowerCase();
      results = results.filter(parcel => {
        // Handle null/undefined status as "pending"
        const parcelStatus = (parcel.status || 'pending').toLowerCase();
        return parcelStatus === filterStatus;
      });
    }
    
    // Apply date filter
    if (this.dateFilter) {
      const filterDate = new Date(this.dateFilter);
      filterDate.setHours(0, 0, 0, 0); // Start of day
      
      results = results.filter(parcel => {
        if (!parcel.date) return false;
        
        const parcelDate = new Date(parcel.date);
        parcelDate.setHours(0, 0, 0, 0); // Start of day
        
        return parcelDate.getTime() === filterDate.getTime();
      });
    }
    
    this.filteredParcels = results;
    console.log(`Applied filters: Status=${this.statusFilter}, Found=${this.filteredParcels.length} results`);
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      color: 'danger',
      position: 'bottom'
    });
    toast.present();
  }

  addParcel() {
    this.router.navigate(['/add-parcel']);
  }

  viewParcelDetail(id: string) {
    this.router.navigate(['/parcel-detail', id]);
  }

  editParcel(id: string) {
    this.router.navigate(['/edit-parcel', id]);
  }

  async deleteParcel(id: string) {
    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: 'Are you sure you want to delete this parcel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        }, {
          text: 'Delete',
          handler: async () => {
            try {
              // Use runInInjectionContext for Firestore operation
              await runInInjectionContext(this.injector, () => {
                return this.firestore.collection('parcels').doc(id).delete();
              });
              
              const toast = await this.toastController.create({
                message: 'Parcel deleted successfully',
                duration: 2000,
                color: 'success',
                position: 'bottom'
              });
              toast.present();
              
              // No need to manually reload - the subscription will handle it
            } catch (error) {
              console.error('Error deleting parcel:', error);
              const toast = await this.toastController.create({
                message: 'Failed to delete parcel',
                duration: 2000,
                color: 'danger',
                position: 'bottom'
              });
              toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
  }

  goBack() {
    this.router.navigate(['/admin-home']);
  }
}