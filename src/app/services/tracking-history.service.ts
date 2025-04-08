import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';
import firebase from 'firebase/compat/app';

export interface TrackingEvent {
  trackingId: string;
  parcelId: string;
  status: string;
  title?: string;
  description?: string;
  timestamp: any; // Firebase timestamp
  location?: string;
  deliverymanId?: string;
  deliverymanName?: string;
  photoURL?: string;
  notes?: string;
  active?: boolean;
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TrackingHistoryService {
  // Use field injection like in ParcelService
  private firestore = inject(AngularFirestore);
  private injector = inject(Injector);

  /**
   * Add a new tracking event to the parcel's history
   */
  addTrackingEvent(event: TrackingEvent): Observable<string> {
    // Ensure timestamp is a Firebase timestamp if not already
    if (!(event.timestamp instanceof firebase.firestore.Timestamp)) {
      event.timestamp = firebase.firestore.Timestamp.now();
    }

    // Add to tracking_history collection with runInInjectionContext
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection('tracking_history').add({
          ...event,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(docRef => {
          observer.next(docRef.id);
          observer.complete();
        }).catch(err => {
          observer.error(err);
        });
      });
    });
  }

  /**
   * Get tracking history for a specific parcel by tracking ID
   */
  getTrackingHistory(trackingId: string): Observable<TrackingEvent[]> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection<TrackingEvent>('tracking_history', ref =>
          ref.where('trackingId', '==', trackingId)
            .orderBy('timestamp', 'asc')
        ).valueChanges().subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
}