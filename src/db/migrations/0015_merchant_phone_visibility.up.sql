-- Whether the merchant has explicitly opted in to showing their phone
-- number on their public storefront. Defaults to false so simply HAVING a
-- phone number on file (set at signup/by an admin) never exposes it
-- automatically — the merchant must actively choose to make it visible,
-- separately from merely providing it.
ALTER TABLE merchants ADD COLUMN phone_visible_in_storefront BOOLEAN NOT NULL DEFAULT false;
