// reset-password.js

const bcrypt = require('bcrypt');
const db = require('./database.js');

// ---SETTINGS---
const userEmailToReset = 'paul.westgate@lawsociety.sk.ca';
const newTemporaryPassword = 'password123';
// ---END SETTINGS---


console.log(`Attempting to reset password for ${userEmailToReset}...`);

// Hash the new password before storing it
bcrypt.hash(newTemporaryPassword, 10, (err, hashedPassword) => {
    if (err) {
        console.error("Error hashing the new password:", err);
        return;
    }

    console.log("New password has been hashed successfully.");

    const sql = `UPDATE users SET password = ? WHERE email = ?`;

    // Update the user's password in the database
    db.run(sql, [hashedPassword, userEmailToReset], function(err) {
        if (err) {
            console.error("Error updating the database:", err.message);
            return;
        }

        if (this.changes > 0) {
            console.log(`Password for ${userEmailToReset} has been reset successfully.`);
            console.log(`You can now log in with the temporary password: ${newTemporaryPassword}`);
        } else {
            console.log(`Error: No user found with the email ${userEmailToReset}.`);
            console.log(`Please make sure the user is registered before running this script.`);
        }
    });
});