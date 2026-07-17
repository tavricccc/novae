-- Keep high-churn content counters from retaining avoidable MVCC bloat without
-- increasing autovacuum frequency for the entire database.

alter table app_private.announcements set (
  autovacuum_vacuum_threshold = 50,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 50,
  autovacuum_analyze_scale_factor = 0.05
);

alter table app_private.issues set (
  autovacuum_vacuum_threshold = 50,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_threshold = 50,
  autovacuum_analyze_scale_factor = 0.05
);

alter table app_private.platform_counters set (
  autovacuum_vacuum_threshold = 20,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_analyze_threshold = 20,
  autovacuum_analyze_scale_factor = 0
);

alter table app_private.platform_category_counters set (
  autovacuum_vacuum_threshold = 20,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_analyze_threshold = 20,
  autovacuum_analyze_scale_factor = 0
);

alter table app_private.runtime_settings set (
  autovacuum_vacuum_threshold = 20,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_analyze_threshold = 20,
  autovacuum_analyze_scale_factor = 0
);
