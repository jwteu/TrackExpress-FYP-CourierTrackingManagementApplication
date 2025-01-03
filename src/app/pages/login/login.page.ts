import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule, RouterModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class LoginPage implements OnInit {
  loginForm!: FormGroup;
  errorMessage: string = '';

  constructor(
    private fb: FormBuilder,
    private afAuth: AngularFireAuth,
    private firestore: AngularFirestore,
    private navCtrl: NavController
  ) {}

  ngOnInit() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      role: ['Admin']
    });

    // Reset error message when email or password value changes
    this.loginForm.get('email')?.valueChanges.subscribe(() => {
      this.errorMessage = '';
    });

    this.loginForm.get('password')?.valueChanges.subscribe(() => {
      this.errorMessage = '';
    });
  }

  async onLogin() {
    if (this.loginForm.valid) {
      const { email, password, role } = this.loginForm.value;

      try {
        // Retrieve the user document from Firestore
        const userSnapshot = await this.firestore.collection('users', ref => ref.where('email', '==', email)).get().toPromise();
        
        if (!userSnapshot || userSnapshot.empty) {
          throw new Error('User not found');
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data() as { email: string, role: string };

        console.log('Retrieved user data:', userData);

        // Check if the email matches in a case-sensitive manner
        if (userData.email !== email) {
          console.error('Email case mismatch:', userData.email, email);
          throw new Error('Email case mismatch');
        }

        // Add the role check here
        if (userData.role !== role) {
          console.error('Role mismatch:', userData.role, role);
          throw new Error('Role mismatch');
        }

        // Sign in with Firebase Authentication
        await this.afAuth.signInWithEmailAndPassword(email, password);
        console.log('Login successful');
        
        if (role === 'admin') {
          this.navCtrl.navigateForward('/admin-home');
        } else {
          this.navCtrl.navigateForward('/deliveryman-home');
        }
      } catch (error) {
        console.error('Login error:', error);
        this.errorMessage = 'Your email or password is invalid';
      }
    }
  }
}