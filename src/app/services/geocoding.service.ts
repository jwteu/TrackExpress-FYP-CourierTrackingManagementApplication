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
  
  getAddressFromCoordinates(lat: number, lng: number, options = { zoom: 18 }): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Use a higher zoom level (18) for more precise addresses
        from(fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${options.zoom}&addressdetails=1`
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
        console.log(`Starting real-time location updates for tracking ID: ${trackingId}`);
        
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
            
            // Add validation for the location data
            const lat = parcelData.locationLat;
            const lng = parcelData.locationLng;
            
            if (this.isValidLatitude(lat) && this.isValidLongitude(lng)) {
              console.log(`Location update received for ${trackingId}:`, lat, lng, 
                parcelData.locationUpdatedAt?.toDate?.() || 'no timestamp');
              
              observer.next({
                lat: lat,
                lng: lng,
                locationDescription: parcelData.locationDescription || 'Current Location',
                timestamp: parcelData.locationUpdatedAt || new Date()
              });
            } else {
              console.warn(`Invalid coordinates received for ${trackingId}: lat=${lat}, lng=${lng}`);
              // Don't emit invalid coordinates
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

  // Helper function to validate latitude
  private isValidLatitude(lat: any): boolean {
    return lat !== null && 
           lat !== undefined &&
           !isNaN(lat) && 
           typeof lat === 'number' && 
           isFinite(lat) &&
           Math.abs(lat) <= 90;  // Latitude must be between -90 and 90
  }

  // Helper function to validate longitude
  private isValidLongitude(lng: any): boolean {
    return lng !== null && 
           lng !== undefined &&
           !isNaN(lng) && 
           typeof lng === 'number' && 
           isFinite(lng) &&
           Math.abs(lng) <= 180;  // Longitude must be between -180 and 180
  }

  // Helper function to validate coordinates
  private isValidCoordinate(coord: any): boolean {
    return coord !== null && 
           coord !== undefined &&
           !isNaN(coord) && 
           typeof coord === 'number' && 
           isFinite(coord);
  }
}