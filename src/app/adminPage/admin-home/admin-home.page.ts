import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-admin-home',
  templateUrl: './admin-home.page.html',
  styleUrls: ['./admin-home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AdminHomePage implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
  }

  navigateTo(page: string) {
    this.router.navigate([page]);
  }

  logout() {
    // Add your logout logic here (e.g., clearing tokens, etc.)
    this.router.navigate(['/login']);
  }
}