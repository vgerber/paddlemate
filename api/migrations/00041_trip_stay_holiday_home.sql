-- A rented house or flat - Ferienhaus, Ferienwohnung, the Airbnb kind of
-- base. It is neither a campsite nor a hotel, and groups book one often
-- enough that "other" was hiding a common case.
-- Added before 'other' so the catch-all stays last in the type.
ALTER TYPE trip_stay_kind ADD VALUE 'holiday_home' BEFORE 'other';
