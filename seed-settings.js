// seed-settings.js
const db = require('./database.js');

const settings = [
    { key: 'cpd_hours_active', value: '12' },
    { key: 'ethics_hours_active', value: '2' },
    { key: 'cpd_hours_limited', value: '6' },
    { key: 'ethics_hours_limited', value: '1' }
];

console.log("Seeding settings table...");
const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");

settings.forEach(setting => {
    stmt.run(setting.key, setting.value, function(err) {
        if (err) {
            console.log(`Setting already exists: ${setting.key}`);
        } else {
            console.log(`Added setting: ${setting.key} = ${setting.value}`);
        }
    });
});

stmt.finalize((err) => {
    if (err) console.error(err);
    console.log("Settings seeding complete.");
    db.close();
});