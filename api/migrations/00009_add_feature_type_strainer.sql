-- Add missing feature type for strainers.
ALTER TYPE feature_type ADD VALUE IF NOT EXISTS 'strainer';