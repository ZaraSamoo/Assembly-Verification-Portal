-- Public read access for the root executive dashboard (no login).
-- Principals still submit through /s/[code]; this only opens SELECT.

ALTER TABLE IF EXISTS institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assembly_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read institutions" ON institutions;
CREATE POLICY "Public can read institutions"
  ON institutions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public can read assembly submissions" ON assembly_submissions;
CREATE POLICY "Public can read assembly submissions"
  ON assembly_submissions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public can read assembly photos" ON storage.objects;
CREATE POLICY "Public can read assembly photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'assembly-photos');
