import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';
import firebase from 'firebase/compat/app';
import { map } from 'rxjs/operators';

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
 
export interface ParcelHandler {
  trackingId: string;
  parcelId: string;
  deliverymanId: string;
  deliverymanName: string;
  photoURL?: string;
  assignedAt: any; // Firebase timestamp
  removedAt?: any; // Firebase timestamp when they're done with it
  status: string; // Status when handling the parcel
  notes?: string;
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
        ).get().pipe(
          map(snapshot => snapshot.docs.map(doc => doc.data() as TrackingEvent))
        ).subscribe({
          next: (data) => {
            observer.next(data);
            observer.complete(); // Explicitly complete after getting data
          },
          error: (err) => observer.error(err)
        });
      });
    });
  }

  /**
   * Get tracking history for multiple parcels by their tracking IDs
   * @param trackingIds Array of tracking IDs to fetch history for
   * @returns Observable with arrays of tracking events grouped by tracking ID
   */
  getBatchTrackingHistory(trackingIds: string[]): Observable<Map<string, TrackingEvent[]>> {
    if (!trackingIds || trackingIds.length === 0) {
      return new Observable(observer => {
        observer.next(new Map());
        observer.complete();
      });
    }

    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Firestore has a 'in' operator limitation of 10 items
        // Split into batches if needed
        const batchSize = 10;
        const batches: string[][] = [];
        
        for (let i = 0; i < trackingIds.length; i += batchSize) {
          batches.push(trackingIds.slice(i, i + batchSize));
        }
        
        // Map to store results grouped by tracking ID
        const resultMap = new Map<string, TrackingEvent[]>();
        let completedBatches = 0;
        
        batches.forEach(batchIds => {
          this.firestore.collection<TrackingEvent>('tracking_history', ref =>
            ref.where('trackingId', 'in', batchIds)
              .orderBy('timestamp', 'asc')
          ).valueChanges().subscribe({
            next: (events) => {
              // Group events by tracking ID
              events.forEach(event => {
                if (!resultMap.has(event.trackingId)) {
                  resultMap.set(event.trackingId, []);
                }
                resultMap.get(event.trackingId)?.push(event);
              });
              
              completedBatches++;
              if (completedBatches === batches.length) {
                observer.next(resultMap);
                observer.complete();
              }
            },
            error: (err) => observer.error(err)
          });
        });
      });
    });
  }

  /**
   * Record a new parcel handler when a deliveryman takes responsibility for a parcel
   */
  addParcelHandler(handler: ParcelHandler): Observable<string> {
    // Ensure timestamp is a Firebase timestamp
    if (!(handler.assignedAt instanceof firebase.firestore.Timestamp)) {
      handler.assignedAt = firebase.firestore.Timestamp.now();
    }

    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection('parcel_handlers').add({
          ...handler,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          active: true
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
   * Update a handler record when deliveryman completes their part
   */
  completeParcelHandling(trackingId: string, deliverymanId: string): Observable<void> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Find the active handler record for this deliveryman and parcel
        this.firestore.collection('parcel_handlers', ref =>
          ref.where('trackingId', '==', trackingId)
            .where('deliverymanId', '==', deliverymanId)
            .where('active', '==', true)
        ).get().subscribe({
          next: (snapshot) => {
            if (snapshot.empty) {
              observer.error(new Error('No active handler record found'));
              return;
            }
            
            // Update the handler record with removal time
            const handlerDoc = snapshot.docs[0];
            handlerDoc.ref.update({
              removedAt: firebase.firestore.FieldValue.serverTimestamp(),
              active: false
            }).then(() => {
              observer.next();
              observer.complete();
            }).catch(err => {
              observer.error(err);
            });
          },
          error: (err) => observer.error(err)
        });
      });
    });
  }

  /**
   * Get all handlers for a specific parcel by tracking ID
   */
  getParcelHandlers(trackingId: string): Observable<ParcelHandler[]> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection<ParcelHandler>('parcel_handlers', ref =>
          ref.where('trackingId', '==', trackingId)
            .orderBy('assignedAt', 'asc')
        ).valueChanges().subscribe({
          next: (handlers) => {
            observer.next(handlers);
            observer.complete();
          },
          error: (err) => observer.error(err)
        });
      });
    });
  }
}