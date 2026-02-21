CREATE DATABASE IF NOT EXISTS escala_atendimento CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE escala_atendimento;

CREATE TABLE IF NOT EXISTS teams (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS collaborators (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    team_id INT UNSIGNED NOT NULL,
    gender ENUM('F','M','N') NOT NULL DEFAULT 'N',
    weekday_shift_end TIME NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_collaborators_team FOREIGN KEY (team_id) REFERENCES teams(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('FDS','FERIADO') NOT NULL,
    event_date DATE NOT NULL,
    label VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event_type_date (type, event_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shifts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    team_id INT UNSIGNED NOT NULL,
    collaborator_id INT UNSIGNED NOT NULL,
    shift_start TIME NOT NULL,
    shift_end TIME NOT NULL,
    break_10_1 TIME NOT NULL,
    break_20 TIME NOT NULL,
    break_10_2 TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_shifts_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_shifts_team FOREIGN KEY (team_id) REFERENCES teams(id),
    CONSTRAINT fk_shifts_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
    UNIQUE KEY uq_shift_event_collaborator (event_id, collaborator_id)
) ENGINE=InnoDB;

INSERT INTO teams (code, name)
VALUES
    ('ANALISTA', 'Analistas'),
    ('SUPORTE_N1', 'Suporte N1')
ON DUPLICATE KEY UPDATE name = VALUES(name);
