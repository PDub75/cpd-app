// set-admin.js
const db = require('./database.js');

const adminEmail = 'paul.westgate@lawsociety.sk.ca';

const sql = `UPDATE users SET role = 'Administrator' WHERE email = ?`;

db.run(sql, [adminEmail], function(err) {
    if (err) {
        return console.error("Database error:", err.message);
    }
    if (this.changes > 0) {
        console.log(`Successfully assigned Administrator role to ${adminEmail}.`);
    } else {
        console.log(`User with email ${adminEmail} not found. Please register the user first, then run this script again.`);
    }
});