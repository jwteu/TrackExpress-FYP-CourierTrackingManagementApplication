import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrackingParcelPage } from './tracking-parcel.page';

describe('TrackingParcelPage', () => {
  let component: TrackingParcelPage;
  let fixture: ComponentFixture<TrackingParcelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TrackingParcelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
