import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ParcelDetailPage } from './parcel-detail.page';

describe('ParcelDetailPage', () => {
  let component: ParcelDetailPage;
  let fixture: ComponentFixture<ParcelDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ParcelDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
