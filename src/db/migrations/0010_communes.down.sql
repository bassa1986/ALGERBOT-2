ALTER TABLE stores DROP CONSTRAINT stores_base_commune_fk;
ALTER TABLE stores DROP COLUMN base_commune_code;
DROP TABLE communes;
