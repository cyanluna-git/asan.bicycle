DROP POLICY IF EXISTS "authenticated users can insert uphill_segments" ON uphill_segments;

CREATE POLICY "uphill_segments: course owners can insert"
  ON uphill_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );

CREATE POLICY "uphill_segments: course owners can update"
  ON uphill_segments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );

CREATE POLICY "uphill_segments: course owners can delete"
  ON uphill_segments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );
