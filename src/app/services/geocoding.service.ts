import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private injector = inject(Injector);
  private firestore = inject(AngularFirestore);
  
  getAddressFromCoordinates(lat: number, lng: number): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        from(fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        )
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to get address from coordinates');
          }
          return response.json();
        }))
        .pipe(
          catchError(error => {
            console.error('Error in reverse geocoding:', error);
            return of({ display_name: `${lat}, ${lng}` });
          })
        )
        .subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  sendEmailNotification(email: string, name: string, trackingId: string, status: string, location: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
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
        
        from(fetch('https://api.emailjs.com/api/v1.0/email/send', {
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
        }))
        .subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }

  getCoordinatesFromAddress(address: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        if (!address || address.trim() === '') {
          observer.error(new Error('Address is empty'));
          return;
        }
        
        const encodedAddress = encodeURIComponent(address);
        
        from(fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`
        )
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to get coordinates from address');
          }
          return response.json();
        }))
        .pipe(
          catchError(error => {
            console.error('Error in geocoding:', error);
            return of([]);
          })
        )
        .subscribe({
          next: (data) => {
            if (data && data.length > 0) {
              observer.next(data[0]);
            } else {
              observer.next(null);
            }
            observer.complete();
          },
          error: (err) => observer.error(err)
        });
      });
    });
  }

  getDeliverymanLocationUpdates(trackingId: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        const subscription = this.firestore.collection('assigned_parcels', ref => 
          ref.where('trackingId', '==', trackingId)
        ).snapshotChanges().subscribe({
          next: (snapshots) => {
            if (snapshots.length === 0) {
              console.log('No assigned parcel found for tracking ID:', trackingId);
              observer.next(null);
              return;
            }
            
            const parcelData = snapshots[0].payload.doc.data() as any;
            
            if (parcelData && parcelData.locationLat && parcelData.locationLng) {
              observer.next({
                lat: parcelData.locationLat,
                lng: parcelData.locationLng,
                locationDescription: parcelData.locationDescription || 'Current Location',
                timestamp: parcelData.locationUpdatedAt || new Date()
              });
            } else {
              console.log('Missing location data for tracking ID:', trackingId);
              observer.next(null);
            }
          },
          error: (err) => {
            console.error('Error tracking deliveryman location:', err);
            observer.error(err);
          }
        });
        
        // Return a function that properly unsubscribes
        return () => {
          console.log('Cleaning up location subscription');
          subscription.unsubscribe();
        };
      });
    });
  }
}