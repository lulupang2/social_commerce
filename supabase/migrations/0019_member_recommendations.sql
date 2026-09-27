-- Add opt-in recommendation criteria to the Go member preference row.
-- NULL means unset; historic skill defaults alone must not imply a personalized match.
ALTER TABLE summergear_app.member_preferences
  ADD COLUMN preferred_sport text CHECK (preferred_sport IN ('surf', 'tennis')),
  ADD COLUMN max_budget_krw bigint CHECK (max_budget_krw BETWEEN 1 AND 999999999999),
  ADD COLUMN preferred_region text NOT NULL DEFAULT '' CHECK (char_length(preferred_region) <= 120);
GRANT UPDATE(preferred_sport,max_budget_krw,preferred_region)
  ON summergear_app.member_preferences TO summergear_api;
