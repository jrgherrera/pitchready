import { t } from '../i18n';
import type { MatchLocation } from '../types';

/** Supports legacy string locations from older match docs. */
export function getLocationLabel(location: MatchLocation | string | undefined | null): string {
  if (!location) return t('matches.locationTbd');
  if (typeof location === 'string') return location;
  return location.name || location.address || t('matches.selectedLocation');
}

export function getLocationAddress(location: MatchLocation | string | undefined | null): string {
  if (!location) return '';
  if (typeof location === 'string') return location;
  if (location.name && location.address && location.name !== location.address) {
    return location.address;
  }
  return location.address || '';
}

export function getLocationCoords(
  location: MatchLocation | string | undefined | null,
): { lat: number; lng: number } | null {
  if (!location || typeof location === 'string') return null;
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') return null;
  return { lat: location.lat, lng: location.lng };
}

export function openMapsDirections(location: MatchLocation): void {
  const url = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Reverse-geocode lat/lng via OpenStreetMap Nominatim.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<MatchLocation> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return {
      lat,
      lng,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    };
  }

  const data = (await response.json()) as {
    display_name?: string;
    name?: string;
    address?: {
      leisure?: string;
      amenity?: string;
      building?: string;
      road?: string;
      suburb?: string;
      city?: string;
      town?: string;
      village?: string;
    };
  };

  const placeName =
    data.name ||
    data.address?.leisure ||
    data.address?.amenity ||
    data.address?.building ||
    undefined;

  return {
    lat,
    lng,
    address: data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    name: placeName,
  };
}
