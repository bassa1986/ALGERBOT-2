-- Communes (municipalities) of Algeria, scoped under their wilaya. A
-- commune's code is only unique within its wilaya (not globally), so the
-- primary key is the (wilaya_code, code) pair — mirroring how the official
-- administrative numbering works.
CREATE TABLE communes (
  wilaya_code SMALLINT NOT NULL REFERENCES wilayas (code),
  code SMALLINT NOT NULL,          -- commune's numeric code within its wilaya
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  PRIMARY KEY (wilaya_code, code)
);

CREATE INDEX communes_wilaya_code_idx ON communes (wilaya_code);

-- A store's physical commune, scoped to (and validated against) its own
-- wilaya via the composite foreign key below — a store can't be assigned a
-- commune that belongs to a different wilaya than base_wilaya_code.
ALTER TABLE stores ADD COLUMN base_commune_code SMALLINT;
ALTER TABLE stores ADD CONSTRAINT stores_base_commune_fk
  FOREIGN KEY (base_wilaya_code, base_commune_code) REFERENCES communes (wilaya_code, code);
