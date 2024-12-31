import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { IonicModule, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule]
})
export class ResetPasswordPage implements OnInit {
  resetPasswordForm!: FormGroup;
  errorMessage: string = '';
  successMessage: string = '';

  constructor(private fb: FormBuilder, private afAuth: AngularFireAuth, private firestore: AngularFirestore, private navCtrl: NavController) { }

  ngOnInit() {
    this.resetPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // Reset error message when email value changes
    this.resetPasswordForm.get('email')?.valueChanges.subscribe(() => {
      this.errorMessage = '';
    });
  }

  async onSubmit() {
    if (this.resetPasswordForm.valid) {
      const email = this.resetPasswordForm.get('email')!.value;

      try {
        // Check if the email exists in the Firestore database
        const userSnapshot = await this.firestore.collection('users', ref => ref.where('email', '==', email)).get().toPromise();
        
        if (!userSnapshot || userSnapshot.empty) {
          throw new Error('Email not found');
        }

        await this.afAuth.sendPasswordResetEmail(email);
        console.log('Reset password email sent:', email);
        this.successMessage = 'A password reset email has been sent to your email address.';
        this.errorMessage = '';
      } catch (error: any) {
        console.error('Reset password error:', error);
        if (error.message === 'Email not found') {
          this.errorMessage = 'You never sign up with this email.';
        } else {
          this.errorMessage = 'Failed to send password reset email. Please ensure the email is registered.';
        }
        this.successMessage = '';
      }
    }
  }
}