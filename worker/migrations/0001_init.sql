PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  gender TEXT NOT NULL DEFAULT 'N' CHECK (gender IN ('F', 'M', 'N')),
  weekday_shift_end TEXT NULL,
  rotation_group TEXT NULL CHECK (rotation_group IN ('A', 'B')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('FDS', 'FERIADO')),
  event_date TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (type, event_date)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  collaborator_id INTEGER NOT NULL,
  shift_start TEXT NOT NULL,
  shift_end TEXT NOT NULL,
  break_10_1 TEXT NOT NULL,
  break_20 TEXT NOT NULL,
  break_10_2 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
  UNIQUE (event_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_team_id ON collaborators(team_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_is_active ON collaborators(is_active);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_shifts_event_id ON shifts(event_id);
CREATE INDEX IF NOT EXISTS idx_shifts_team_id ON shifts(team_id);
CREATE INDEX IF NOT EXISTS idx_shifts_collaborator_id ON shifts(collaborator_id);

CREATE TRIGGER IF NOT EXISTS trg_collaborators_updated_at
AFTER UPDATE ON collaborators
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE collaborators
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_updated_at
AFTER UPDATE ON events
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE events
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_shifts_updated_at
AFTER UPDATE ON shifts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE shifts
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

INSERT INTO teams (code, name)
VALUES
  ('ANALISTA', 'Analistas'),
  ('SUPORTE_N1', 'Suporte N1')
ON CONFLICT(code) DO UPDATE SET name = excluded.name;
