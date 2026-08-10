import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Check, Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { useT } from '../../../i18n';
import type { MatchLocation } from '../../../types';
import { reverseGeocode } from '../../../utils/location';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons broken by Vite bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const DEFAULT_CENTER: L.LatLngExpression = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 13;

interface LocationPickerModalProps {
  initial?: MatchLocation | null;
  onConfirm: (location: MatchLocation) => void;
  onClose: () => void;
}

export function LocationPickerModal({
  initial,
  onConfirm,
  onClose,
}: LocationPickerModalProps) {
  const t = useT();
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [draft, setDraft] = useState<MatchLocation | null>(initial ?? null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  const applyLatLng = async (lat: number, lng: number, map?: L.Map | null) => {
    setResolving(true);
    try {
      const location = await reverseGeocode(lat, lng);
      setDraft(location);
      const target = map ?? mapRef.current;
      if (target) {
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(target);
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current?.getLatLng();
            if (pos) void applyLatLng(pos.lat, pos.lng);
          });
        } else {
          markerRef.current.setLatLng([lat, lng]);
        }
      }
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;

    const start = initial
      ? ([initial.lat, initial.lng] as L.LatLngExpression)
      : DEFAULT_CENTER;

    const map = L.map(mapHostRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(start, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      void applyLatLng(event.latlng.lat, event.latlng.lng, map);
    });

    mapRef.current = map;

    if (initial) {
      markerRef.current = L.marker([initial.lat, initial.lng], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLatLng();
        if (pos) void applyLatLng(pos.lat, pos.lng);
      });
    }

    // Invalidate size after sheet animation
    const timer = window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      alert(t('locationPicker.geoUnavailable'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        mapRef.current?.setView([latitude, longitude], 16);
        void applyLatLng(latitude, longitude).finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        alert(t('locationPicker.geoFailed'));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-end justify-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="w-full max-w-md bg-[#0a1c17] border-t border-[#1f453a] rounded-t-2xl z-10 flex flex-col max-h-[92vh] animate-slide-up">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#1f453a]">
          <div>
            <h3 className="font-anton text-xl text-[#d4f000] uppercase tracking-wider">
              {t('locationPicker.title')}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{t('locationPicker.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative h-[42vh] min-h-[240px] bg-[#020f0b]">
          <div ref={mapHostRef} className="absolute inset-0 z-0" />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="absolute top-3 right-3 z-[500] flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0a1c17]/95 border border-[#1f453a] text-xs font-bold text-white hover:border-[#d4f000] disabled:opacity-60"
          >
            {locating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4f000]" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-[#d4f000]" />
            )}
            {t('locationPicker.nearMe')}
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 border-t border-[#1f453a]">
          <div className="flex items-start gap-2.5 min-h-[3rem]">
            <MapPin className="w-5 h-5 text-[#d4f000] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              {resolving ? (
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('locationPicker.resolving')}
                </p>
              ) : draft ? (
                <>
                  {draft.name && (
                    <p className="text-sm font-bold text-white truncate">{draft.name}</p>
                  )}
                  <p className="text-xs text-gray-400 leading-relaxed">{draft.address}</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">{t('locationPicker.selectPoint')}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={!draft || resolving}
            onClick={() => draft && onConfirm(draft)}
            className="w-full bg-[#d4f000] hover:bg-[#b0c800] disabled:opacity-40 text-[#001710] font-anton py-3.5 rounded-xl uppercase tracking-wider text-sm flex items-center justify-center gap-2"
          >
            {t('locationPicker.confirm')} <Check className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
}
