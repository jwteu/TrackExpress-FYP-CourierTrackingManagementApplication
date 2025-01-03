import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeliverymanHomePage } from './deliveryman-home.page';

describe('DeliverymanHomePage', () => {
  let component: DeliverymanHomePage;
  let fixture: ComponentFixture<DeliverymanHomePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DeliverymanHomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
