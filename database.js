// database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./cpd.db', (err) => {
    if (err) { console.error(err.message); }
    console.log('Connected to the cpd.db database.');
});

db.serialize(() => {
    // UPDATED: Added user_role_in_activity to the activities table
    db.run(`
        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            competency_name TEXT NOT NULL,
            activity_title TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            user_role_in_activity TEXT,
            notes TEXT,
            hours DECIMAL(4, 2) DEFAULT 0,
            is_ethics BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'Not Started',
            completion_date DATE,
            FOREIGN KEY (plan_id) REFERENCES plans (id)
        )
    `);
    // All other tables are created as before
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, lawyer_id TEXT, register_type TEXT, role TEXT NOT NULL DEFAULT 'Member')`);
    db.run(`CREATE TABLE IF NOT EXISTS domains (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`);
    db.run(`CREATE TABLE IF NOT EXISTS competencies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, domain_id INTEGER NOT NULL, FOREIGN KEY (domain_id) REFERENCES domains (id))`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS learning_activities (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL UNIQUE)`);
    db.run(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, year INTEGER NOT NULL, competencies TEXT, status TEXT DEFAULT 'Draft', FOREIGN KEY (user_id) REFERENCES users (id))`);
});

module.exports = db;