import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

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
      secretKey: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validator: this.passwordMatchValidator });
  }

  passwordMatchValidator(form: FormGroup) {
    return form.get('password')!.value === form.get('confirmPassword')!.value
      ? null : { mismatch: true };
  }

  async onSubmit() {
    if (this.signupForm.valid) {
      const { name, email, icNumber, phone, address, role, secretKey, password } = this.signupForm.value;

      // Validate secret key
      if ((role === 'admin' && secretKey !== 'admin8133') || 
          (role === 'deliveryman' && secretKey !== 'delivery2237')) {
        console.error('Invalid secret key');
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
            email,
            icNumber,
            phone,
            address,
            role,
            uid
          });

          console.log('Signup successful');
          this.navCtrl.navigateForward('/login');
        }
      } catch (error) {
        console.error('Signup error:', error);
      }
    }
  }
}