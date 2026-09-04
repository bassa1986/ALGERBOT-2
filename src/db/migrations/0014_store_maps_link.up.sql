-- The merchant's own Google Maps link for their physical store location
-- (a plain URL a merchant copies from Google Maps' "Share" button, e.g.
-- https://maps.app.goo.gl/... or https://www.google.com/maps/place/...).
-- Optional, like whatsapp_number -- most merchants won't have (or need) a
-- physical location to show. Deliberately a raw URL rather than lat/lng
-- columns: no map-picker UI to build, and it round-trips exactly what the
-- merchant already has from Google Maps with zero geocoding on this app's
-- side.
ALTER TABLE stores ADD COLUMN google_maps_url TEXT;
