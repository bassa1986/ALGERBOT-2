-- The merchant's chosen storefront color theme, picked from a small
-- curated set (see THEME_PRESETS in src/lib/store-themes.ts) rather than
-- a free-form color picker -- guarantees every combination stays legible
-- against the existing light surface/text colors instead of risking bad
-- contrast a merchant could accidentally create with full color freedom.
-- NULL means "use the default AlgerBot theme" (the current colors,
-- unchanged) -- this is the default for every existing and new store, so
-- nothing changes visually until a merchant actively picks one.
ALTER TABLE stores ADD COLUMN theme_id TEXT;
