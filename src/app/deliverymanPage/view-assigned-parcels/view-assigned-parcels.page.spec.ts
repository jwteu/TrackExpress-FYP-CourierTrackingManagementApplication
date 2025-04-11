import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { ViewAssignedParcelsPage } from './view-assigned-parcels.page';

describe('ViewAssignedParcelsPage', () => {
  let component: ViewAssignedParcelsPage;
  let fixture: ComponentFixture<ViewAssignedParcelsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewAssignedParcelsPage],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(ViewAssignedParcelsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
