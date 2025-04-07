import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  getAddressFromCoordinates(lat: number, lng: number): Observable<any> {
    return from(fetch(
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
    );
  }
  
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