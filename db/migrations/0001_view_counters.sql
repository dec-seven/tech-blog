CREATE TABLE IF NOT EXISTS view_counters (
  scope TEXT NOT NULL CHECK(scope IN ('site', 'article')),
  resource TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0),
  PRIMARY KEY (scope, resource)
);
