-- Attribution disputes were removed from the product: credits now simply show each lead's stage and,
-- once a hall request is approved, who sold it. The dispute RPCs are no longer called anywhere.
drop function if exists public.dispute_attribution(uuid, text);
drop function if exists public.resolve_attribution_dispute(uuid, uuid, text);
