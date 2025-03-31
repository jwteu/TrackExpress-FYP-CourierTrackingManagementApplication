import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController } from '@ionic/angular';

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
  
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private firestore: AngularFirestore,
    private navCtrl: NavController,
    private toastController: ToastController // Inject ToastController
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

  loadUserData() {
    this.isLoading = true;
    
    const sessionData = localStorage.getItem('userSession');
    if (!sessionData) {
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      this.userData = userSession;
      
      this.firestore.collection('users').doc(userSession.uid).get().subscribe(
        (doc) => {
          if (doc.exists) {
            const userData = doc.data() as any;
            this.profileForm.patchValue({
              name: userData.name || '',
              email: userData.email || '',
              icNumber: userData.icNumber || '',
              phone: userData.phone || '',
              address: userData.address || '',
              role: userData.role || '',
              staffId: userData.staffId || ''
            });
            this.isLoading = false;
          } else {
            console.error('User document not found');
            this.router.navigate(['/login']);
          }
        },
        (error) => {
          console.error('Error fetching user data:', error);
          this.isLoading = false;
        }
      );
    } catch (error) {
      console.error('Error parsing user session:', error);
      this.router.navigate(['/login']);
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
    console.log('Save profile called');
    console.log('Form valid:', this.profileForm.valid);
    console.log('Form values:', this.profileForm.value);
    
    if (this.profileForm.valid) {
      this.isLoading = true;
      this.updateSuccess = false;
      this.updateError = '';

      // Only include the editable fields in the update data
      const updatedData = {
        phone: this.profileForm.get('phone')?.value,
        address: this.profileForm.get('address')?.value
      };

      console.log('Updated Data:', updatedData);
      console.log('User UID:', this.userData.uid);

      try {
        // Update user document in Firestore
        await this.firestore.collection('users').doc(this.userData.uid).update(updatedData);

        // Update session data in localStorage
        const sessionData = localStorage.getItem('userSession');
        if (sessionData) {
          const userSession = JSON.parse(sessionData);
          const updatedSession = {
            ...userSession,
            ...updatedData
          };
          localStorage.setItem('userSession', JSON.stringify(updatedSession));
        }

        this.updateSuccess = true;
        this.isLoading = false;
        this.isEditMode = false;

        // Disable editable fields
        this.profileForm.get('phone')?.disable();
        this.profileForm.get('address')?.disable();

        // Notify the user of the successful update with a toast
        // that automatically dismisses after 2 seconds
        const toast = await this.toastController.create({
          message: 'Profile updated successfully!',
          duration: 3000, // Display for 3 seconds
          position: 'bottom',
          color: 'success',
          buttons: [
            {
              icon: 'checkmark-circle-outline',
              role: 'cancel'
            }
          ],
          cssClass: 'success-toast'
        });
        toast.present();

      } catch (error: any) {
        console.error('Error updating profile:', error);
        this.updateError = 'Failed to update profile. Please try again.';
        this.isLoading = false;
      }
    } else {
      console.error('Form is invalid:', this.profileForm.errors);
      this.updateError = 'Please correct the form errors before saving.';
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  // Add a method to get user initials for the avatar
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