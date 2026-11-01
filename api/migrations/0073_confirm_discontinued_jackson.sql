-- Jackson lists these on its own Legacy Whitewater Kayaks page and not in its
-- current whitewater lineup. Entries a user edited (updated_by set) are left alone.
UPDATE materials SET
    availability = 'discontinued',
    availability_source = 'https://web.archive.org/web/20260103024244/https://jacksonkayak.com/whitewater/legacy-kayaks/',
    availability_checked = DATE '2026-11-01'
WHERE category = 'kayak'
  AND created_by = 'system-catalogue'
  AND updated_by IS NULL
  AND lower(btrim(brand)) = 'jackson'
  AND lower(btrim(model)) IN ('hero', 'super hero', 'villain', 'karma');
