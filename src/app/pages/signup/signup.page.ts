import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
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
  secretKeyError: string = '';
  nameError: string = '';

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
      secretKey: ['', Validators.required],
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

    // Reset secret key error when secret key value changes
    this.signupForm.get('secretKey')?.valueChanges.subscribe(() => {
      this.secretKeyError = '';
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

  private async validateStaffId(staffId: string): Promise<boolean> {
    const staffDoc = await this.firestore.collection('staff', ref => ref.where('staffId', '==', staffId)).get().toPromise();
    return staffDoc ? !staffDoc.empty : false;
  }

  private async validateStaffName(staffId: string, name: string): Promise<boolean> {
    const staffDoc = await this.firestore.collection('staff', ref => ref.where('staffId', '==', staffId).where('name', '==', name)).get().toPromise();
    return staffDoc ? !staffDoc.empty : false;
  }

  async onSubmit() {
    if (this.signupForm.valid) {
      const { name, email, icNumber, phone, address, role, staffId, secretKey, password } = this.signupForm.value;

      // Validate staff ID
      const isValidStaffId = await this.validateStaffId(staffId);
      if (!isValidStaffId) {
        console.error('Invalid staff ID');
        this.staffIdError = 'Invalid staff ID. Please use a valid staff ID.';
        return;
      }

      // Validate staff name
      const isValidStaffName = await this.validateStaffName(staffId, name);
      if (!isValidStaffName) {
        console.error('Invalid staff name');
        this.nameError = 'Please enter the name that matches the IC.';
        return;
      }

      // Validate secret key
      if ((role === 'admin' && secretKey !== 'admin8133') || 
          (role === 'deliveryman' && secretKey !== 'delivery2237')) {
        console.error('Invalid secret key');
        this.secretKeyError = 'Invalid secret key. Please use a valid secret key.';
        return;
      }

      try {
        // Create user with Firebase Authentication
        const userCredential = await this.afAuth.createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user?.uid;

        // Save additional user data to Firestore
        if (uid) {
          await this.firestore.collection('users').doc(uid).set({
            name,
            email, // Store the email in its original case
            icNumber,
            phone,
            address,
            role,
            staffId,
            uid
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