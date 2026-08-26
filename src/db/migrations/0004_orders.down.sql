DROP TABLE IF EXISTS order_checklist_events;
DROP TABLE IF EXISTS order_items;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS fk_inventory_movements_order;
DROP TABLE IF EXISTS orders;
