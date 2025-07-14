// database.js

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./cpd.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the cpd.db database.');
});

db.serialize(() => {
  // UPDATED: Added lawyer_id and role columns
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      lawyer_id TEXT,
      role TEXT NOT NULL DEFAULT 'Member'
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log("Users table is ready.");
    }
  });

  // The rest of the tables remain the same
  db.run(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `, (err) => { /* ... */ });
  db.run(`
    CREATE TABLE IF NOT EXISTS competencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      domain_id INTEGER NOT NULL,
      FOREIGN KEY (domain_id) REFERENCES domains (id)
    )
  `, (err) => { /* ... */ });
  db.run(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      competencies TEXT,
      objectives TEXT,
      strategies TEXT,
      status TEXT DEFAULT 'Draft',
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `, (err) => { /* ... */ });
  db.run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      competency_name TEXT NOT NULL,
      activity_description TEXT NOT NULL,
      notes TEXT,
      hours DECIMAL(4, 2) DEFAULT 0,
      is_ethics BOOLEAN DEFAULT 0,
      status TEXT DEFAULT 'Not Started',
      completion_date DATE,
      FOREIGN KEY (plan_id) REFERENCES plans (id)
    )
  `, (err) => { /* ... */ });
});

module.exports = db;