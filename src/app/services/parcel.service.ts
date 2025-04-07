import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable, from, map, of } from 'rxjs';
import firebase from 'firebase/compat/app';

export interface Parcel {
  id?: string;
  trackingId: string;
  name: string;
  locationLat: number;
  locationLng: number;
  addedDate: any;
  receiverAddress?: string;
  receiverName?: string;
  status?: string;
  selected?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ParcelService {
  private firestore = inject(AngularFirestore);
  private injector = inject(Injector);
  
  // Get user by ID - publicly exposing this functionality
  getUserByID(userId: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection('users').doc(userId).get().pipe(
          map(doc => {
            if (doc.exists) {
              return { id: doc.id, ...(doc.data() as Record<string, any>) };
            }
            return null;
          })
        ).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Get assigned parcels for a specific deliveryman
  getAssignedParcels(deliverymanName: string): Observable<Parcel[]> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection<Parcel>('assigned_parcels', ref => 
          ref.where('name', '==', deliverymanName)
        ).valueChanges({ idField: 'id' }).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Get parcel details from the main parcels collection
  getParcelDetails(trackingId: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection('parcels', ref => 
          ref.where('trackingId', '==', trackingId)
        ).get().pipe(
          map(snapshot => {
            if (snapshot.empty) {
              return null;
            }
            return { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as Record<string, any>) };
          })
        ).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Check if a parcel is already assigned
  isParcelAssigned(trackingId: string): Observable<boolean> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        this.firestore.collection('assigned_parcels', ref => 
          ref.where('trackingId', '==', trackingId)
        ).get().pipe(
          map(snapshot => !snapshot.empty)
        ).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Add a parcel to assigned_parcels collection
  addAssignedParcel(parcelData: any): Observable<string> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        from(this.firestore.collection('assigned_parcels').add(parcelData)).pipe(
          map(docRef => docRef.id)
        ).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Update parcel status in main parcels collection
  updateParcelStatus(parcelId: string, updateData: any): Observable<void> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        from(this.firestore.collection('parcels').doc(parcelId).update(updateData))
          .subscribe({
            next: () => observer.next(),
            error: (err) => observer.error(err),
            complete: () => observer.complete()
          });
      });
    });
  }
  
  // Remove assigned parcel
  removeAssignedParcel(parcelId: string): Observable<void> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        from(this.firestore.collection('assigned_parcels').doc(parcelId).delete())
          .subscribe({
            next: () => observer.next(),
            error: (err) => observer.error(err),
            complete: () => observer.complete()
          });
      });
    });
  }
  
  // Reset parcel status in main parcels collection
  resetParcelStatus(parcelId: string): Observable<void> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        from(this.firestore.collection('parcels').doc(parcelId).update({
          status: 'Pending',
          deliverymanId: firebase.firestore.FieldValue.delete(),
          deliverymanName: firebase.firestore.FieldValue.delete()
        })).subscribe({
          next: () => observer.next(),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Add email notification method
  sendEmailNotification(email: string, name: string, trackingId: string, status: string, location: string): Observable<any> {
    const params = {
      service_id: 'service_o0nwz8b',
      template_id: 'template_1yqzf6m',
      user_id: 'ghZzg_nWOdHQY6Krj',
      template_params: {
        tracking_id: trackingId,
        status,
        to_name: name,
        location_info: location,
        to_email: email,
        from_name: 'TrackExpress',
        reply_to: 'noreply@trackexpress.com'
      }
    };
    
    return from(fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to send email notification');
      }
      return response;
    }));
  }
}