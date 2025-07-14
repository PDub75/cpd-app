// check-users.js
const db = require('./database.js');

console.log("Fetching all users from the database...");

const sql = `SELECT id, name, email, role FROM users`;

db.all(sql, [], (err, rows) => {
    if (err) {
        return console.error("Error fetching users:", err.message);
    }
    if (rows.length === 0) {
        console.log("The users table is empty. Please register your accounts first.");
    } else {
        console.log("--- Registered Users ---");
        rows.forEach((row) => {
            console.log(`ID: ${row.id}, Name: ${row.name}, Email: ${row.email}, Role: ${row.role}`);
        });
        console.log("------------------------");
    }
});

db.close((err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Closed the database connection.');
});