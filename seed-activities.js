// seed-activities.js
const db = require('./database.js');

const activities = [
    "Live - In-person CPD Activity",
    "Live - Virtual CPD Activity",
    "Online Course",
    "Recorded CPD Activity",
    "Study Group",
    "University Course",
    "Webinar",
    "Other"
];

console.log("Seeding learning_activities table...");
db.serialize(() => {
    const stmt = db.prepare("INSERT INTO learning_activities (description) VALUES (?)");

    activities.forEach(activity => {
        stmt.run(activity, function(err) {
            if (err) {
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
        db.close();
    });
});