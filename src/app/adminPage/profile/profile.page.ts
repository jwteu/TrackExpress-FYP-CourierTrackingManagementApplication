import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
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
    private navCtrl: NavController
  ) { }

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
    
    // Get user session from localStorage
    const sessionData = localStorage.getItem('userSession');
    
    if (!sessionData) {
      // No session found, redirect to login
      this.router.navigate(['/login']);
      return;
    }
    
    try {
      const userSession = JSON.parse(sessionData);
      this.userData = userSession;
      
      // Fetch the latest user data from Firestore
      this.firestore.collection('users').doc(userSession.uid).get().subscribe(
        (doc) => {
          if (doc.exists) {
            const userData = doc.data() as any;
            
            // Update the form with user data
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
      // Enable editable fields
      this.profileForm.get('email')?.enable();
      this.profileForm.get('phone')?.enable();
      this.profileForm.get('address')?.enable();
    } else {
      // Disable editable fields
      this.profileForm.get('email')?.disable();
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
        email: this.profileForm.get('email')?.value,
        phone: this.profileForm.get('phone')?.value,
        address: this.profileForm.get('address')?.value
      };
      
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
        this.profileForm.get('email')?.disable();
        this.profileForm.get('phone')?.disable();
        this.profileForm.get('address')?.disable();
        
        // Return to previous page after successful update
        setTimeout(() => {
          this.navCtrl.back();
        }, 1500);
        
      } catch (error) {
        console.error('Error updating profile:', error);
        this.updateError = 'Failed to update profile. Please try again.';
        this.isLoading = false;
      }
    }
  }
  
  goBack() {
    this.navCtrl.back();
  }
}