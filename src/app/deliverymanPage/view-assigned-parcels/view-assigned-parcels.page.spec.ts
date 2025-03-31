import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewAssignedParcelsPage } from './view-assigned-parcels.page';

describe('ViewAssignedParcelsPage', () => {
  let component: ViewAssignedParcelsPage;
  let fixture: ComponentFixture<ViewAssignedParcelsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ViewAssignedParcelsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
