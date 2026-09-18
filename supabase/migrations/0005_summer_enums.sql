-- PostgreSQL enum values must be committed before later migrations can use them.
-- Retired values remain in the enum for PostgreSQL compatibility, then 0006 adds
-- constraints that reject them at the table boundary.

alter type public.listing_category add value if not exists 'footwear' after 'apparel';
alter type public.listing_category add value if not exists 'protective' after 'footwear';
alter type public.listing_status add value if not exists 'rejected' after 'pending_review';
