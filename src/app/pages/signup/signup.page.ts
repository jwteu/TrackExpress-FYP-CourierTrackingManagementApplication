import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, runInInjectionContext, Injector } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class SignupPage implements OnInit {
  signupForm!: FormGroup;
  emailError: string = '';
  staffIdError: string = '';
  nameError: string = '';

  // Add injector property
  private injector = inject(Injector);

  constructor(
    private fb: FormBuilder,
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.signupForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      icNumber: ['', [Validators.required, Validators.pattern(/^\d{12}$/)]],
      phone: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      address: ['', Validators.required],
      role: ['', Validators.required],
      staffId: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validator: this.passwordMatchValidator });

    // Reset email error when email value changes
    this.signupForm.get('email')?.valueChanges.subscribe(() => {
      this.emailError = '';
    });

    // Reset staff ID error when staff ID value changes
    this.signupForm.get('staffId')?.valueChanges.subscribe(() => {
      this.staffIdError = '';
    });

    // Reset name error when name value changes
    this.signupForm.get('name')?.valueChanges.subscribe(() => {
      this.nameError = '';
    });
  }

  passwordMatchValidator(form: FormGroup) {
    return form.get('password')!.value === form.get('confirmPassword')!.value
      ? null : { mismatch: true };
  }

  private async validateStaffId(staffId: string, role: string): Promise<boolean> {
    const staffSnapshot = await runInInjectionContext(this.injector, () => {
      return firstValueFrom(
        this.firestore.collection('staff', ref => 
          ref.where('staffId', '==', staffId).where('role', '==', role)).get()
      );
    });
    return !staffSnapshot.empty;
  }

  private async validateStaffName(staffId: string, name: string, role: string): Promise<boolean> {
    const staffSnapshot = await runInInjectionContext(this.injector, () => {
      return firstValueFrom(
        this.firestore.collection('staff', ref => 
          ref.where('staffId', '==', staffId).where('name', '==', name).where('role', '==', role)).get()
      );
    });
    return !staffSnapshot.empty;
  }

  async onSubmit() {
    if (this.signupForm.valid) {
      const { name, email, icNumber, phone, address, role, staffId, password } = this.signupForm.value;

      // Validate staff ID
      const isValidStaffId = await this.validateStaffId(staffId, role);
      if (!isValidStaffId) {
        console.error('Invalid staff ID or role');
        this.staffIdError = 'Invalid staff ID or role. Please use a valid staff ID and role.';
        return;
      }

      // Validate staff name
      const isValidStaffName = await this.validateStaffName(staffId, name, role);
      if (!isValidStaffName) {
        console.error('Invalid staff name or role');
        this.nameError = 'Please enter the name that matches the IC and role.';
        return;
      }

      try {
        // Create user with Firebase Authentication
        const userCredential = await runInInjectionContext(this.injector, () => {
          return this.afAuth.createUserWithEmailAndPassword(email, password);
        });
        const uid = userCredential.user?.uid;

        // Save additional user data to Firestore
        if (uid) {
          await runInInjectionContext(this.injector, () => {
            return this.firestore.collection('users').doc(uid).set({
              name,
              email, // Store the email in its original case
              icNumber,
              phone,
              address,
              role,
              staffId,
              uid
            });
          });

          console.log('Signup successful');
          this.navCtrl.navigateForward('/login');
        }
      } catch (error: any) {
        if (this.isFirebaseAuthError(error) && error.code === 'auth/email-already-in-use') {
          console.error('Email already used');
          // Set the error message
          this.emailError = 'Email already used. Please use a different email.';
        } else {
          console.error('Signup error:', error);
        }
      }
    }
  }

  private isFirebaseAuthError(error: any): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error;
  }
}