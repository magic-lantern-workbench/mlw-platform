-- Reusable assets, one row per asset. mlw.layer.asset_ref refers to asset_id.
CREATE TABLE IF NOT EXISTS mlw.asset (
  asset_id    text,
  name        text,
  category    text,
  version     text,
  source_url  text,
  description text,
  PRIMARY KEY (asset_id)
);
