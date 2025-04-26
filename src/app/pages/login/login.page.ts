import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, inject, runInInjectionContext, Injector } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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

  // Inject the injector to use with runInInjectionContext
  private injector = inject(Injector);

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
        // First, clear ALL existing data completely
        localStorage.clear();
        console.log('localStorage cleared');
        
        // First authenticate with Firebase
        const userCredential = await this.afAuth.signInWithEmailAndPassword(email, password);
        const firebaseUser = userCredential.user;
        
        if (!firebaseUser) {
          throw new Error('Authentication failed');
        }
        
        console.log('Firebase auth successful, UID:', firebaseUser.uid);
        
        // Now fetch user data using the verified UID
        const userDoc = await runInInjectionContext(this.injector, () => {
          return firstValueFrom(
            this.firestore.collection('users').doc(firebaseUser.uid).get()
          );
        });

        if (!userDoc.exists) {
          throw new Error('User document not found');
        }
        
        const userData = userDoc.data() as { email: string, role: string, name: string, staffId: string };
        console.log('Fetched user data from Firestore:', JSON.stringify(userData));
        
        // Verify the role matches what was selected
        if (userData.role !== role) {
          console.error('Role mismatch:', userData.role, role);
          this.errorMessage = 'Selected role does not match your account.';
          await this.afAuth.signOut();
          return;
        }

        // Store user session data with the VERIFIED uid
        const sessionData = {
          uid: firebaseUser.uid,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          staffId: userData.staffId || '',
          loggedInAt: new Date().toISOString(),
          sessionId: this.generateUniqueId()
        };
        
        console.log('About to store in localStorage:', JSON.stringify(sessionData));
        localStorage.setItem('userSession', JSON.stringify(sessionData));
        console.log('localStorage updated with session data');

        if (role === 'admin') {
          this.navCtrl.navigateRoot('/admin-home', { replaceUrl: true });
        } else {
          this.navCtrl.navigateRoot('/deliveryman-home', { replaceUrl: true });
        }
      } catch (error) {
        console.error('Login error:', error);
        this.errorMessage = 'Your email or password is invalid';
      }
    }
  }

  // Generate a unique session ID
  private generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  // Add this method to handle back button clicks manually if needed
  goToLanding() {
    this.navCtrl.navigateBack('/landing');
  }
}