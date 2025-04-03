import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TakePhotoPage } from './take-photo.page';

describe('TakePhotoPage', () => {
  let component: TakePhotoPage;
  let fixture: ComponentFixture<TakePhotoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TakePhotoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
