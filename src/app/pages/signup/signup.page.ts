import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLinkWithHref } from '@angular/router';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule, RouterLinkWithHref]
})
export class SignupPage implements OnInit {
  signupForm!: FormGroup;

  constructor(private fb: FormBuilder, private navCtrl: NavController) { }

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

  onSubmit() {
    if (this.signupForm.valid) {
      const role = this.signupForm.get('role')!.value;
      const secretKey = this.signupForm.get('secretKey')!.value;

      if ((role === 'admin' && secretKey === 'admin8133') || (role === 'deliveryman' && secretKey === 'delivery2237')) {
        // Handle successful signup
        console.log('Signup successful', this.signupForm.value);
        this.navCtrl.navigateForward('/home');
      } else {
        // Handle invalid secret key
        console.error('Invalid secret key');
      }
    }
  }
}