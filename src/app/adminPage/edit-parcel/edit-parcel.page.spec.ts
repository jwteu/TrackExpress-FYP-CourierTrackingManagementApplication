import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditParcelPage } from './edit-parcel.page';

describe('EditParcelPage', () => {
  let component: EditParcelPage;
  let fixture: ComponentFixture<EditParcelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EditParcelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
