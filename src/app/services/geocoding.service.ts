import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AngularFirestore } from '@angular/fire/compat/firestore';

declare const google: any;

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private injector = inject(Injector);
  private firestore = inject(AngularFirestore);
  
  getAddressFromCoordinates(lat: number, lng: number, options = { zoom: 18 }): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Use Google Maps Geocoder
        const geocoder = new google.maps.Geocoder();
        const latlng = new google.maps.LatLng(lat, lng);
        
        geocoder.geocode({ 'location': latlng }, (results: google.maps.GeocoderResult[], status: google.maps.GeocoderStatus) => {
          if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
            // Use the most detailed result
            observer.next({
              formatted_address: results[0].formatted_address,
              address_components: results[0].address_components,
              geometry: results[0].geometry
            });
          } else {
            // Fallback to coordinates
            observer.next({ 
              formatted_address: `${lat}, ${lng}`,
              geometry: {
                location: { lat: () => lat, lng: () => lng }
              }
            });
          }
          observer.complete();
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
        
        // Use Google Maps Geocoder
        const geocoder = new google.maps.Geocoder();
        
        geocoder.geocode({ 'address': address }, (results: google.maps.GeocoderResult[], status: google.maps.GeocoderStatus) => {
          if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
            const location = results[0].geometry.location;
            
            observer.next({
              lat: location.lat(),
              lon: location.lng(),
              formatted_address: results[0].formatted_address
            });
          } else {
            observer.next(null);
          }
          observer.complete();
        });
      });
    });
  }

  getDeliverymanLocationUpdates(trackingId: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        console.log(`Starting real-time location updates for tracking ID: ${trackingId}`);
        
        // Use snapshotChanges for real-time updates
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
              console.log(`Valid location update received for ${trackingId}:`, lat, lng, 
                parcelData.locationDescription || 'No description');
              
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
        
        // Return a cleanup function
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