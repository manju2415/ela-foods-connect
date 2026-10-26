import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Loader2 } from "lucide-react";
import { roundCoordinate, type LatLng } from "@/lib/deliveryLocation";

interface LocationMapProps {
  position: LatLng;
  /** Called when the customer drags the pin or taps the map. */
  onChange: (position: LatLng) => void;
  className?: string;
}

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.2 0 0 7.1 0 15.9 0 27.8 16 42 16 42s16-14.2 16-26.1C32 7.1 24.8 0 16 0z" fill="hsl(var(--primary))" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>`;

/**
 * OpenStreetMap + Leaflet map with one draggable pin. Leaflet is loaded only
 * when this mounts (inside the location dialog), so it adds nothing to the
 * checkout page's own load. If it fails to load, only this box shows an error.
 */
export function LocationMap({ position, onChange, className }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialPosition = useRef(position);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const [{ default: L }] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !containerRef.current) return;

        const start: [number, number] = [initialPosition.current.latitude, initialPosition.current.longitude];
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(start, 17);
        map.attributionControl.setPrefix(false); // keep only the required OpenStreetMap credit
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        const icon = L.divIcon({ className: "", html: PIN_SVG, iconSize: [32, 42], iconAnchor: [16, 42] });
        const marker = L.marker(start, { draggable: true, icon, keyboard: true, title: "Delivery location" }).addTo(map);

        const report = (lat: number, lng: number) =>
          onChangeRef.current({ latitude: roundCoordinate(lat), longitude: roundCoordinate(lng) });
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          report(p.lat, p.lng);
        });
        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          report(e.latlng.lat, e.latlng.lng);
        });

        // The dialog animates open, so the map's size settles after mount.
        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);

        mapRef.current = map;
        markerRef.current = marker;
        setStatus("ready");
      } catch (error) {
        console.error("Map failed to load:", error);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Position set from outside (e.g. "Use My Current Location"): move pin and view.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - position.latitude) < 1e-7 && Math.abs(current.lng - position.longitude) < 1e-7) return;
    marker.setLatLng([position.latitude, position.longitude]);
    map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 17));
  }, [position.latitude, position.longitude, status]);

  return (
    <div className={`relative isolate overflow-hidden rounded-lg border bg-muted ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="Map: drag the pin or tap to set your delivery location" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          The map couldn't load. Check your internet connection — you can still continue with your typed address.
        </div>
      )}
    </div>
  );
}
