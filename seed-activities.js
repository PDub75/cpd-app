// seed-activities.js
const db = require('./database.js');

// The final, correct list of 8 activity types
const activities = [
    "Live - In-person CPD Activity",
    "Live - Virtual CPD Activity",
    "Online Course",
    "Other",
    "Recorded CPD Activity",
    "Study Group",
    "University Course",
    "Webinar"
];

console.log("Seeding learning_activities table with final types...");
db.serialize(() => {
    const stmt = db.prepare("INSERT INTO learning_activities (description) VALUES (?)");

    activities.forEach(activity => {
        stmt.run(activity, function(err) {
            if (err) {
                // This error will happen if the item already exists, which is fine.
                console.log(`Skipping activity (already exists): ${activity}`);
            } else {
                console.log(`Added activity: ${activity}`);
            }
        });
    });

    stmt.finalize((err) => {
        if (err) {
            return console.error("Error finalizing statement:", err.message);
        }
        console.log("Activity seeding complete.");
        db.close((err) => {
            if (err) {
                return console.error(err.message);
            }
            console.log('Closed the database connection.');
        });
    });
});