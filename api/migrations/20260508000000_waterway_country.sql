ALTER TABLE waterways ADD COLUMN IF NOT EXISTS country VARCHAR(2);
ALTER TABLE waterways ADD COLUMN IF NOT EXISTS region VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_waterways_country ON waterways(country);
