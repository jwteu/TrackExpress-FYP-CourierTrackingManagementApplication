import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private cloudName = 'dbcsrkzg5'; 
  private uploadPreset = 'delivery_photos';
  private injector = inject(Injector);

  /**
   * Upload an image to Cloudinary
   * @param file The image file to upload (can be Blob or File)
   * @param fileName Optional name for the file
   * @returns Observable with the upload result
   */
  uploadImage(file: Blob | File, fileName?: string): Observable<any> {
    return new Observable(observer => {
      runInInjectionContext(this.injector, () => {
        // Create form data for the upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.uploadPreset);

        // Add optional filename if provided
        if (fileName) {
          formData.append('public_id', fileName);
        }

        // Add folder path
        formData.append('folder', 'parcel-photos');

        // Create the upload URL
        const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;

        // Perform the fetch operation
        fetch(uploadUrl, {
          method: 'POST',
          body: formData
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Upload failed: ' + response.statusText);
          }
          return response.json();
        })
        .then(result => {
          observer.next(result);
          observer.complete();
        })
        .catch(error => {
          observer.error(error);
        });
      });
    });
  }
}