-- The merchant's own WhatsApp contact number (E.164-ish, digits only, no
-- leading '+'), so buyers can reach them via WhatsApp's free "click to
-- chat" deep link (https://wa.me/<number>) — same purpose as
-- telegram_username, a different channel. Optional, like Telegram.
ALTER TABLE merchants ADD COLUMN whatsapp_number TEXT;
