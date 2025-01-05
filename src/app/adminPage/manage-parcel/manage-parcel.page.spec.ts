import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ManageParcelPage } from './manage-parcel.page';

describe('ManageParcelPage', () => {
  let component: ManageParcelPage;
  let fixture: ComponentFixture<ManageParcelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ManageParcelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
