"use client";

import { useEffect, useRef } from "react";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

type MarkerPoint = {
  lat: number;
  lng: number;
  label: string;
  kind: "pickup" | "delivery" | "driver";
};

export function UsaTrackingMap({
  route,
  markers,
  className,
}: {
  route: [number, number][];
  markers: MarkerPoint[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      // Ensure default marker icons work with bundlers
      const defaultProto = L.Icon.Default.prototype as unknown as {
        _getIconUrl?: unknown;
      };
      delete defaultProto._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      const layers = L.layerGroup().addTo(map);
      mapRef.current = map;
      layersRef.current = layers;
    }

    void init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function draw() {
      const map = mapRef.current;
      const layers = layersRef.current;
      if (!map || !layers) return;
      const L = (await import("leaflet")).default;
      layers.clearLayers();

      const bounds: LatLngExpression[] = [];

      if (route.length >= 2) {
        const line = L.polyline(route as LatLngExpression[], {
          color: "#38a3ff",
          weight: 5,
          opacity: 0.95,
          // Keep road shape visible; do not over-simplify into a chord
          smoothFactor: 0.5,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(layers);
        bounds.push(...(line.getLatLngs() as LatLngExpression[]));
      }

      for (const m of markers) {
        const color =
          m.kind === "pickup"
            ? "#22c55e"
            : m.kind === "delivery"
              ? "#f59e0b"
              : "#ef4444";
        const circle = L.circleMarker([m.lat, m.lng], {
          radius: m.kind === "driver" ? 9 : 7,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindPopup(m.label)
          .addTo(layers);
        bounds.push(circle.getLatLng());
      }

      if (bounds.length) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 });
      } else {
        map.setView([39.5, -98.35], 4);
      }
    }

    void draw();
  }, [route, markers]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[420px] w-full rounded-xl border border-[var(--color-border)]"}
    />
  );
}
