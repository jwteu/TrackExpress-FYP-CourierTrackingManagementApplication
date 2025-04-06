import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, Injector, runInInjectionContext } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ProfilePage implements OnInit {
  profileForm!: FormGroup;
  isLoading = true;
  updateSuccess = false;
  updateError = '';
  userData: any = {};
  isEditMode = false;
  
  // Add injector for Firebase operations
  private injector = inject(Injector);
  
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private firestore: AngularFirestore,
    private navCtrl: NavController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.initForm();
    this.loadUserData();
  }

  initForm() {
    this.profileForm = this.fb.group({
      name: [{value: '', disabled: true}],
      email: [{value: '', disabled: true}, [Validators.required, Validators.email]],
      icNumber: [{value: '', disabled: true}],
      phone: [{value: '', disabled: true}, [Validators.required, Validators.pattern(/^\d+$/)]],
      address: [{value: '', disabled: true}, [Validators.required]],
      role: [{value: '', disabled: true}],
      staffId: [{value: '', disabled: true}]
    });
  }

  async loadUserData() {
    this.isLoading = true;
    
    const sessionData = localStorage.getItem('userSession');
    if (!sessionData) {
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      this.userData = userSession;
      
      // Use runInInjectionContext for Firestore query
      const userDoc = await runInInjectionContext(this.injector, () => {
        return firstValueFrom(
          this.firestore.collection('users').doc(userSession.uid).get()
        );
      });
      
      if (userDoc.exists) {
        const userData = userDoc.data() as any;
        this.profileForm.patchValue({
          name: userData.name || '',
          email: userData.email || '',
          icNumber: userData.icNumber || '',
          phone: userData.phone || '',
          address: userData.address || '',
          role: userData.role || '',
          staffId: userData.staffId || ''
        });
      } else {
        console.error('User document not found');
        this.router.navigate(['/login']);
      }
      this.isLoading = false;
    } catch (error) {
      console.error('Error fetching user data:', error);
      this.isLoading = false;
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.profileForm.get('phone')?.enable();
      this.profileForm.get('address')?.enable();
    } else {
      this.profileForm.get('phone')?.disable();
      this.profileForm.get('address')?.disable();
    }
  }

  async saveProfile() {
    if (this.profileForm.valid) {
      this.isLoading = true;
      this.updateSuccess = false;
      this.updateError = '';

      const updatedData = {
        phone: this.profileForm.get('phone')?.value,
        address: this.profileForm.get('address')?.value
      };

      try {
        // Use runInInjectionContext for Firestore operation
        await runInInjectionContext(this.injector, () => {
          return this.firestore.collection('users').doc(this.userData.uid).update(updatedData);
        });
        
        this.isLoading = false;
        this.updateSuccess = true;
        this.isEditMode = false;
        
        // Show toast for successful update
        const toast = await this.toastController.create({
          message: 'Profile updated successfully',
          duration: 2000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
        
        // Update disabled fields
        this.profileForm.get('phone')?.disable();
        this.profileForm.get('address')?.disable();
      } catch (error: any) {
        console.error('Error updating profile:', error);
        this.isLoading = false;
        this.updateError = 'Failed to update profile. Please try again.';
      }
    } else {
      this.updateError = 'Please correct the form errors before saving.';
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  getUserInitials(): string {
    const name = this.profileForm.get('name')?.value || '';
    if (!name) return '?';
    
    const nameParts = name.split(' ');
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
    
    return name[0]?.toUpperCase() || '?';
  }
}