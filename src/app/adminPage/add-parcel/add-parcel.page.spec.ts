import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddParcelPage } from './add-parcel.page';

describe('AddParcelPage', () => {
  let component: AddParcelPage;
  let fixture: ComponentFixture<AddParcelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddParcelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
