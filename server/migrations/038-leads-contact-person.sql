-- Add contact_person column to leads. The scraper already extracts person
-- names via extractPersonName() but leadgen.model.js INSERT was dropping
-- them silently, so every personalization run fell back to email-local-part
-- parsing and ~25% of sends went to "Hey there" because no name could be
-- found. Storing the scraped name means we use it directly when available.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
