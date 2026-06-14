-- Representative MMATF-shape schema + fixtures for local `wrangler dev` (mirrors src/seed.ts).
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  url TEXT,
  venue_name TEXT,
  town TEXT,
  lat REAL,
  lng REAL
);
CREATE TABLE IF NOT EXISTS event_days (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  day TEXT NOT NULL,
  end_day TEXT,
  all_day INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  open_time TEXT,
  close_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_days_day ON event_days(day);

INSERT INTO events (id, title, category, url, venue_name, town, lat, lng) VALUES
  (1, 'Spring Craft Fair', 'Fair', 'https://example.org/events/craft-fair', 'Town Green', 'Farmington', 41.72, -72.83),
  (2, 'Saturday Farmers Market', 'Market', 'https://example.org/events/market', 'Main St Lot', 'Avon', 41.81, -72.83),
  (3, 'Green Concert Series', 'Music', NULL, 'Bandshell', 'Simsbury', 41.88, -72.80),
  (4, 'Summer Art Exhibit', 'Festival', NULL, 'Arts Center', 'Hartford', 41.76, -72.67);

INSERT INTO event_days (id, event_id, day, end_day, all_day, start_time, end_time, open_time, close_time) VALUES
  ('1-2026-06-06', 1, '2026-06-06', '2026-06-07', 1, NULL, NULL, '10:00', '17:00'),
  ('2-2026-06-06', 2, '2026-06-06', NULL, 1, NULL, NULL, '09:00', '13:00'),
  ('2-2026-06-13', 2, '2026-06-13', NULL, 1, NULL, NULL, '09:00', '13:00'),
  ('2-2026-06-20', 2, '2026-06-20', NULL, 1, NULL, NULL, '09:00', '13:00'),
  ('3-2026-06-13', 3, '2026-06-13', NULL, 0, '19:00', '21:00', NULL, NULL),
  ('4-2026-06-01', 4, '2026-06-01', '2026-06-30', 1, NULL, NULL, NULL, NULL);
