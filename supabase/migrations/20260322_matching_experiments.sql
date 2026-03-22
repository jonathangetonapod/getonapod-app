-- Create matching_experiments table to store autoresearch experiment results
-- Used by run-matching-experiment and run-experiment-sweep edge functions
-- to track precision/recall/F1 across different vector search parameters

CREATE TABLE IF NOT EXISTS matching_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  parameters JSONB NOT NULL,
  precision_score DECIMAL,
  recall_score DECIMAL,
  f1_score DECIMAL,
  avg_overlap DECIMAL,
  prospects_evaluated INT,
  total_predictions INT,
  total_correct INT,
  duration_seconds INT,
  notes TEXT
);

-- Index for querying best experiments
CREATE INDEX idx_matching_experiments_f1 ON matching_experiments(f1_score DESC NULLS LAST);
CREATE INDEX idx_matching_experiments_created ON matching_experiments(created_at DESC);

-- Enable RLS
ALTER TABLE matching_experiments ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can write (edge functions use service role key)
-- No public read needed — this is internal analytics
CREATE POLICY "Service role full access on matching_experiments"
  ON matching_experiments
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE matching_experiments IS 'Stores results from autoresearch experiment runs comparing vector search parameters against human feedback';
COMMENT ON COLUMN matching_experiments.parameters IS 'JSON with similarity_threshold, min_score, match_count, max_results used for this run';
COMMENT ON COLUMN matching_experiments.precision_score IS 'true_positives / (true_positives + false_positives)';
COMMENT ON COLUMN matching_experiments.recall_score IS 'true_positives / (true_positives + false_negatives)';
COMMENT ON COLUMN matching_experiments.f1_score IS '2 * (precision * recall) / (precision + recall)';
COMMENT ON COLUMN matching_experiments.avg_overlap IS 'Average overlap ratio between predictions and approved podcasts per prospect';
