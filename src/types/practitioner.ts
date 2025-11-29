export interface PractitionerLocation {
  id: string;
  name: string;
  specialty: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  available: boolean;
  rating: number;
  phone: string;
  image?: string;
  practitioner_type?: string;
  intervention_zone?: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}
