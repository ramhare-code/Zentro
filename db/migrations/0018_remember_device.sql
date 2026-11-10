-- "Remember this device": a 30-day session on a device the staff member trusts.
alter table shop.staff_sessions add column remember boolean not null default false;
