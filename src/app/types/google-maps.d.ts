declare namespace google {
  export namespace maps {
    export class Geocoder {
      geocode(request: GeocoderRequest, callback: (results: GeocoderResult[], status: GeocoderStatus) => void): void;
    }
    
    export interface GeocoderRequest {
      address?: string;
      location?: LatLng;
      bounds?: LatLngBounds;
      componentRestrictions?: GeocoderComponentRestrictions;
      region?: string;
    }
    
    export interface GeocoderComponentRestrictions {
      administrativeArea?: string;
      country?: string | string[];
      locality?: string;
      postalCode?: string;
      route?: string;
    }
    
    export class LatLng {
      constructor(lat: number, lng: number, noWrap?: boolean);
      lat(): number;
      lng(): number;
    }
    
    export class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(point: LatLng): LatLngBounds;
    }
    
    export interface GeocoderResult {
      address_components: GeocoderAddressComponent[];
      formatted_address: string;
      geometry: GeocoderGeometry;
      partial_match: boolean;
      place_id: string;
      plus_code?: PlusCode;
      postcode_localities?: string[];
      types: string[];
    }
    
    export interface GeocoderAddressComponent {
      long_name: string;
      short_name: string;
      types: string[];
    }
    
    export interface GeocoderGeometry {
      location: LatLng;
      location_type: GeocoderLocationType;
      viewport: LatLngBounds;
      bounds?: LatLngBounds;
    }
    
    export enum GeocoderLocationType {
      APPROXIMATE = 'APPROXIMATE',
      GEOMETRIC_CENTER = 'GEOMETRIC_CENTER',
      RANGE_INTERPOLATED = 'RANGE_INTERPOLATED',
      ROOFTOP = 'ROOFTOP'
    }
    
    export interface PlusCode {
      compound_code: string;
      global_code: string;
    }
    
    export enum GeocoderStatus {
      ERROR = 'ERROR',
      INVALID_REQUEST = 'INVALID_REQUEST',
      OK = 'OK',
      OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
      REQUEST_DENIED = 'REQUEST_DENIED',
      UNKNOWN_ERROR = 'UNKNOWN_ERROR',
      ZERO_RESULTS = 'ZERO_RESULTS'
    }

    export class Map {
      constructor(mapDiv: HTMLElement, opts?: MapOptions);
      setCenter(latLng: LatLng): void;
      setZoom(zoom: number): void;
      fitBounds(bounds: LatLngBounds): void;
    }

    export interface MapOptions {
      center?: LatLng;
      zoom?: number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      zoomControl?: boolean;
    }

    export class Marker {
      constructor(opts: MarkerOptions);
      setPosition(latLng: LatLng): void;
      setMap(map: Map | null): void;
      addListener(event: string, handler: Function): void;
      getPosition(): LatLng;
      setAnimation(animation: any): void;
    }

    export interface MarkerOptions {
      position: LatLng;
      map?: Map;
      title?: string;
      icon?: Icon | string;
      animation?: any;
    }

    export interface Icon {
      url: string;
      scaledSize?: Size;
    }

    export class Size {
      constructor(width: number, height: number);
    }

    export class InfoWindow {
      constructor(opts?: InfoWindowOptions);
      setContent(content: string | Node): void;
      open(map: Map, anchor?: Marker): void;
    }

    export interface InfoWindowOptions {
      content?: string | Node;
      maxWidth?: number;
    }

    export class DirectionsService {
      route(request: DirectionsRequest, callback: (response: DirectionsResult, status: DirectionsStatus) => void): void;
    }

    export interface DirectionsRequest {
      origin: string | LatLng | Place;
      destination: string | LatLng | Place;
      travelMode: TravelMode;
    }

    export interface DirectionsResult {
      routes: DirectionsRoute[];
    }

    export interface DirectionsRoute {
      legs: DirectionsLeg[];
    }

    export interface DirectionsLeg {
      distance: Distance;
      duration: Duration;
      start_location: LatLng;
      end_location: LatLng;
    }

    export interface Distance {
      text: string;
      value: number;
    }

    export interface Duration {
      text: string;
      value: number;
    }

    export enum DirectionsStatus {
      OK = 'OK',
      NOT_FOUND = 'NOT_FOUND',
      ZERO_RESULTS = 'ZERO_RESULTS',
      MAX_WAYPOINTS_EXCEEDED = 'MAX_WAYPOINTS_EXCEEDED',
      MAX_ROUTE_LENGTH_EXCEEDED = 'MAX_ROUTE_LENGTH_EXCEEDED',
      INVALID_REQUEST = 'INVALID_REQUEST',
      OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
      REQUEST_DENIED = 'REQUEST_DENIED',
      UNKNOWN_ERROR = 'UNKNOWN_ERROR'
    }

    export enum TravelMode {
      DRIVING = 'DRIVING',
      BICYCLING = 'BICYCLING',
      TRANSIT = 'TRANSIT',
      WALKING = 'WALKING'
    }

    export class DirectionsRenderer {
      constructor(opts?: DirectionsRendererOptions);
      setDirections(result: DirectionsResult): void;
      setMap(map: Map | null): void;
    }

    export interface DirectionsRendererOptions {
      map?: Map;
      suppressMarkers?: boolean;
      polylineOptions?: PolylineOptions;
    }

    export interface PolylineOptions {
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
    }

    export interface Place {
      location?: LatLng;
      placeId?: string;
      query?: string;
    }

    export class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
    }

    export const Animation: {
      BOUNCE: number;
      DROP: number;
    };
  }
}