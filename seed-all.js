// seed-all.js
const db = require('./database.js');
const bcrypt = require('bcrypt');
const { faker } = require('@faker-js/faker');

// --- Main Seeder Function ---
async function seedDatabase() {
    console.log("Starting database seeding process...");

    await runQuery("DELETE FROM activities");
    await runQuery("DELETE FROM plans");
    await runQuery("DELETE FROM users");
    console.log("Cleared old data from users, plans, and activities tables.");

    const availableCompetencies = await getRows("SELECT name FROM competencies");
    const availableActivities = await getRows("SELECT description FROM learning_activities");

    if (availableCompetencies.length < 5 || availableActivities.length < 5) {
        console.error("Not enough competencies or activities in the database. Please run seed.js and seed-activities.js first.");
        return;
    }

    const usersToCreate = [
        { name: 'Paul Westgate Admin', email: 'paul.westgate@lawsociety.sk.ca', password: '1234', role: 'Administrator', register_type: 'Active' },
        { name: 'Paul Westgate Member', email: 'paul@videoguru.co.za', password: '1234', role: 'Member', register_type: 'Active' }
    ];

    const registerTypes = ['Active', 'Active Pro-Bono', 'Limited Licensee'];
    for (let i = 0; i < 20; i++) {
        usersToCreate.push({
            name: faker.person.fullName(),
            email: faker.internet.email().toLowerCase(),
            password: '1234',
            role: 'Member',
            register_type: faker.helpers.arrayElement(registerTypes),
            lawyer_id: faker.string.numeric(5)
        });
    }

    for (const userData of usersToCreate) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = await insertUser(userData, hashedPassword);
        
        if (user.role === 'Administrator') continue;

        const plan = await createPlanForUser(user, availableCompetencies);

        if (plan.status === 'Submitted') {
            await addActivitiesToPlan(plan, user.register_type, availableActivities);
        }
    }

    console.log("Seeding process complete!");
}

// --- Helper Functions ---
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function insertUser(userData, hashedPassword) {
    const sql = `INSERT INTO users (name, email, password, lawyer_id, role, register_type) VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [userData.name, userData.email, hashedPassword, userData.lawyer_id || faker.string.numeric(5), userData.role, userData.register_type];
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error(`Error creating user ${userData.email}:`, err.message);
                reject(err);
            } else {
                console.log(`Created user: ${userData.name}`);
                resolve({ id: this.lastID, ...userData });
            }
        });
    });
}

function createPlanForUser(user, availableCompetencies) {
    const status = Math.random() > 0.3 ? 'Submitted' : 'Draft';
    // Select 2 to 4 real competencies for the plan
    const selectedCompetencies = faker.helpers.arrayElements(availableCompetencies, { min: 2, max: 4 })
        .map(c => ({ name: c.name, type: 'standard', rating: faker.helpers.arrayElement(['Discover', 'Attempt', 'Do']) }));

    const competenciesJson = JSON.stringify(selectedCompetencies);

    const sql = `INSERT INTO plans (user_id, year, status, competencies) VALUES (?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {
        db.run(sql, [user.id, new Date().getFullYear(), status, competenciesJson], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, status: status, userId: user.id, competencies: selectedCompetencies });
        });
    });
}

async function addActivitiesToPlan(plan, registerType, availableActivities) {
    const isComplete = Math.random() > 0.4; // 60% chance of having completed hours
    const requiredHours = registerType === 'Limited Licensee' ? 6 : 12;
    const requiredEthics = registerType === 'Limited Licensee' ? 1 : 2;
    
    let hoursSoFar = 0;
    let ethicsSoFar = 0;
    
    // For each competency in the plan, add 1-2 activities
    for (const competency of plan.competencies) {
        const activityCount = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < activityCount; i++) {
            const activity = faker.helpers.arrayElement(availableActivities).description;
            let hours = parseFloat((Math.random() * 2 + 0.5).toFixed(2));
            let is_ethics = 0;

            // Logic to try and meet the requirements if isComplete is true
            if (isComplete) {
                if (ethicsSoFar < requiredEthics) {
                    is_ethics = 1;
                    hours = requiredEthics / 2; // Split ethics hours over a couple activities
                }
                if (hoursSoFar < requiredHours) {
                    hours = requiredHours / plan.competencies.length / activityCount;
                }
            }
            
            hours = parseFloat(hours.toFixed(2));
            hoursSoFar += hours;
            if(is_ethics) ethicsSoFar += hours;

            const status = isComplete ? 'Complete' : 'Not Started';
            const completion_date = isComplete ? faker.date.past({ years: 1, refDate: new Date() }) : null;

            const sql = `INSERT INTO activities (plan_id, competency_name, activity_description, hours, is_ethics, status, completion_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            await runQuery(sql, [plan.id, competency.name, activity, hours, is_ethics, status, completion_date]);
        }
    }
}


// Run the seeder
db.serialize(() => {
    seedDatabase().catch(console.error).finally(() => {
        db.close((err) => {
            if (err) console.error(err.message);
            console.log("Database connection closed.");
        });
    });
});