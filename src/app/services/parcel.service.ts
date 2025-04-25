import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/compat/firestore';
import { Observable, from, map, of, first, tap, forkJoin } from 'rxjs'; // Import forkJoin
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
  userId?: string;   // Add userId to the interface
  userEmail?: string; // Add userEmail to the interface
  locationDescription?: string; // Add this property
  photoURL?: string; // Add photoURL
  completedAt?: any; // Add completedAt
  deliverymanId?: string; // Add deliverymanId
  deliverymanName?: string; // Add deliverymanName
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
  
  // Get assigned parcels for a specific deliveryman with user ID verification
  getAssignedParcels(deliverymanName: string, userId?: string): Observable<Parcel[]> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        let query = this.firestore.collection<Parcel>('assigned_parcels', ref => {
          let q = ref.where('name', '==', deliverymanName);
          // If userId is provided, add additional filter for extra security
          if (userId) {
            q = q.where('userId', '==', userId);
          }
          return q;
        });
        
        query.valueChanges({ idField: 'id' }).pipe(
          // Log any inconsistencies for debugging
          tap(parcels => {
            if (userId) {
              const invalidParcels = parcels.filter(p => p.userId && p.userId !== userId);
              if (invalidParcels.length > 0) {
                console.warn('Found parcels with mismatched user ID:', invalidParcels);
              }
            }
          })
        ).subscribe({
          next: (data) => observer.next(data),
          error: (err) => observer.error(err),
          complete: () => observer.complete()
        });
      });
    });
  }
  
  // Get assigned parcels with multi-factor verification
  getAssignedParcelsSecure(deliverymanName: string, userId: string): Observable<Parcel[]> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Require BOTH name and userId to match - significantly more secure
        let query = this.firestore.collection<Parcel>('assigned_parcels', ref => 
          ref.where('name', '==', deliverymanName)
             .where('userId', '==', userId)
        );
        
        query.valueChanges({ idField: 'id' }).subscribe({
          next: (data) => {
            // Additional verification at the application level
            const verifiedData = data.filter(parcel => {
              const ownershipValid = parcel.userId === userId && parcel.name === deliverymanName;
              if (!ownershipValid) {
                console.error(`Security concern: Found parcel ${parcel.trackingId} with mismatched ownership`);
              }
              return ownershipValid;
            });
            
            observer.next(verifiedData);
          },
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
      user_id: 'T1yl0I9kdv0wiyZtr',
      template_params: {
        tracking_id: trackingId,
        parcel_status: status, // Changed to match template variable
        to_name: name,
        location_info: location,
        to_email: email,
        from_name: 'TrackExpress',
        reply_to: 'noreply@trackexpress.com',
        date: new Date().toLocaleDateString() // Added date parameter
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

  /**
   * Update parcel status with tracking history
   */
  updateParcelWithTracking(
    parcelId: string, 
    updateData: any, 
    trackingInfo: { 
      status: string, 
      location?: string, 
      description?: string,
      deliverymanName?: string,
      photoURL?: string
    }
  ): Observable<void> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        try {
          // Get Firestore references within the injection context
          const firestoreInstance = this.firestore.firestore;
          const parcelsCollection = this.firestore.collection('parcels');
          const trackingHistoryCollection = this.firestore.collection('tracking_history');

          // Fetch the parcel document
          parcelsCollection
            .doc(parcelId)
            .get()
            .pipe(first())
            .subscribe({
              next: parcelDoc => {
                // Wrap this callback in runInInjectionContext too
                runInInjectionContext(this.injector, () => {
                  if (!parcelDoc.exists) {
                    observer.error(new Error('Parcel not found'));
                    return;
                  }

                  const parcelData = parcelDoc.data() as any;
                  const trackingId = parcelData.trackingId;

                  // Pre-compute the description
                  const statusDescription =
                    trackingInfo.description || this.getStatusDescription(trackingInfo.status);

                  // Create the batch
                  const batch = firestoreInstance.batch();

                  // Update the parcel document
                  const parcelRef = parcelsCollection.doc(parcelId).ref;
                  batch.update(parcelRef, {
                    ...updateData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                  });

                  // Create a tracking history document
                  const trackingHistoryRef = trackingHistoryCollection.doc().ref;
                  batch.set(trackingHistoryRef, {
                    parcelId,
                    trackingId,
                    status: trackingInfo.status,
                    description: statusDescription,
                    location: trackingInfo.location,
                    deliverymanName: trackingInfo.deliverymanName,
                    photoURL: trackingInfo.photoURL,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                  });

                  // Commit the batch
                  batch
                    .commit()
                    .then(() => {
                      observer.next();
                      observer.complete();
                    })
                    .catch(error => {
                      console.error('Batch commit error:', error);
                      observer.error(error);
                    });
                });
              },
              error: err => {
                console.error('Error fetching parcel document:', err);
                observer.error(err);
              },
            });
        } catch (error) {
          console.error('Top-level error in updateParcelWithTracking:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Update parcel location
   */
  updateParcelLocation(assignedParcelId: string, locationData: any): Observable<void> {
    // Store a reference to the injector
    const localInjector = this.injector;

    return new Observable(observer => {
      // Define the async operation separately to keep the Observable constructor clean
      const updateOperation = async () => {
        try {
          console.log(`Starting location update for parcel ID: ${assignedParcelId}`);

          // --- Wrap Firestore call in runInInjectionContext ---
          const parcelDoc = await runInInjectionContext(localInjector, () =>
            this.firestore.collection('assigned_parcels').doc(assignedParcelId).get().toPromise()
          );

          if (!parcelDoc || !parcelDoc.exists) {
            throw new Error('Assigned parcel not found'); // Use throw for clearer error handling
          }

          const parcelData = parcelDoc.data() as Parcel;

          // --- Wrap Firestore batch creation and collection calls ---
          const batch = runInInjectionContext(localInjector, () => this.firestore.firestore.batch());
          const assignedParcelRef = runInInjectionContext(localInjector, () =>
            this.firestore.collection('assigned_parcels').doc(assignedParcelId).ref
          );

          const locationTimestamp = locationData.locationUpdatedAt || firebase.firestore.FieldValue.serverTimestamp();

          batch.update(assignedParcelRef, {
            locationLat: locationData.locationLat,
            locationLng: locationData.locationLng,
            locationDescription: locationData.locationDescription,
            locationUpdatedAt: locationTimestamp
          });

          let mainParcelId: string | null = null; // To store the ID for tracking history

          if (parcelData.trackingId) {
            // --- Wrap Firestore query ---
            const parcelsSnapshot = await runInInjectionContext(localInjector, () =>
              this.firestore
                .collection('parcels', ref => ref.where('trackingId', '==', parcelData.trackingId))
                .get().toPromise()
            );

            if (parcelsSnapshot && !parcelsSnapshot.empty) {
              const mainParcelRef = parcelsSnapshot.docs[0].ref;
              mainParcelId = parcelsSnapshot.docs[0].id; // Get the ID of the main parcel doc
              batch.update(mainParcelRef, {
                locationLat: locationData.locationLat,
                locationLng: locationData.locationLng,
                locationDescription: locationData.locationDescription,
                locationUpdatedAt: locationTimestamp
              });
            }

            // --- Wrap Firestore collection call ---
            const trackingHistoryRef = runInInjectionContext(localInjector, () =>
              this.firestore.collection('tracking_history').doc().ref
            );

            batch.set(trackingHistoryRef, {
              trackingId: parcelData.trackingId,
              parcelId: mainParcelId, // Use the potentially found main parcel ID
              status: parcelData.status || 'In Transit',
              title: 'Location Update',
              description: `Parcel location updated to ${locationData.locationDescription}`,
              location: locationData.locationDescription,
              deliverymanId: parcelData.userId,
              deliverymanName: parcelData.name,
              timestamp: locationTimestamp,
              createdAt: locationTimestamp // Use the same timestamp for consistency
            });
          }

          // Commit the batch
          await batch.commit();
          console.log(`Successfully updated location for parcel ID: ${assignedParcelId}`);
          observer.next();
          observer.complete();

        } catch (error) {
          // Log the specific error during the update process
          console.error(`Error during updateParcelLocation for ${assignedParcelId}:`, error);
          observer.error(error); // Propagate the error to the subscriber
        }
      };

      // Execute the async operation
      updateOperation();

    }); // End of Observable constructor
  }

  /**
   * Helper method for status descriptions
   */
  private getStatusDescription(status: string): string {
    switch(status) {
      case 'Registered': return 'Parcel has been registered';
      case 'In Transit': return 'Parcel is in transit to delivery location';
      case 'Out for Delivery': return 'Parcel is out for delivery to recipient';
      case 'Delivered': return 'Parcel has been delivered successfully';
      default: return `Status updated to: ${status}`;
    }
  }
}