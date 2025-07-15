// server.js

const express = require('express');
const db = require('./database.js');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { Parser } = require('json2csv');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const upload = multer({ dest: 'uploads/' });

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());

app.use(session({
    secret: 'a-very-strong-secret-key-that-is-hard-to-guess',
    resave: false,
    saveUninitialized: false,
}));

const checkAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'Administrator') {
        next();
    } else {
        res.status(403).send("Forbidden: You do not have access to this page.");
    }
};

app.set('view engine', 'ejs');

// --- HELPER FUNCTIONS ---
function savePlanProgress(planData, callback) {
    const competenciesJson = JSON.stringify(planData.competencies);
    const sql = `UPDATE plans SET competencies = ? WHERE id = ?`;
    db.run(sql, [competenciesJson, planData.id], function(err) {
        if (err) { console.error("Error saving plan progress:", err.message); } 
        else { console.log("Plan progress saved to database."); }
        if (callback) callback(err);
    });
}

function calculateFurthestStep(planData, activities) {
    if (!planData || !planData.competencies || planData.competencies.length < 2) return 3;
    const allRated = planData.competencies.every(c => c.rating);
    if (!allRated) return 4;
    const allHaveActivities = planData.competencies.every(comp => activities.some(act => act.competency_name === comp.name));
    if (!allHaveActivities) return 6;
    return 7;
}

const getOrCreatePlan = (req, res, next) => {
    if (req.session.planData && req.session.planData.id) return next();
    const userId = req.session.user.id;
    const year = new Date().getFullYear();
    const sql = `SELECT * FROM plans WHERE user_id = ? AND year = ?`;
    db.get(sql, [userId, year], (err, plan) => {
        if (err) { return res.redirect('/dashboard'); }
        if (plan) {
            req.session.planData = { id: plan.id, competencies: JSON.parse(plan.competencies || '[]') };
            next();
        } else {
            const insertSql = `INSERT INTO plans (user_id, year, competencies, status) VALUES (?, ?, ?, ?)`;
            db.run(insertSql, [userId, year, '[]', 'Draft'], function(err) {
                if (err) { return res.redirect('/dashboard'); }
                req.session.planData = { id: this.lastID, competencies: [] };
                next();
            });
        }
    });
};

const loadContext = (req, res, next) => {
    if (!req.session.user) return next();
    res.locals.user = req.session.user;
    const userId = req.session.user.id;
    const year = new Date().getFullYear();
    const planSql = `SELECT * FROM plans WHERE user_id = ? AND year = ?`;
    db.get(planSql, [userId, year], (err, plan) => {
        if (err) return next(err);
        res.locals.plan = plan;
        next();
    });
};

// --- ROUTES ---
// Public routes
app.get('/', (req, res) => { res.render('index', { title: 'Welcome' }); });
app.get('/register', (req, res) => { res.render('register', { title: 'Register' }); });
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  const lawyer_id = Math.floor(10000 + Math.random() * 90000).toString();
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, password, lawyer_id, role, register_type) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [name, email, hashedPassword, lawyer_id, 'Member', 'Active'], (err) => {
      if (err) { return res.redirect('/register'); }
      res.redirect('/login');
    });
  } catch (error) { res.redirect('/register'); }
});
app.get('/login', (req, res) => { res.render('login', { title: 'Login', error: req.query.error || null }); });
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM users WHERE email = ?';
  db.get(sql, [email], async (err, user) => {
    if (err) { return res.redirect('/login?error=An unexpected error occurred.'); }
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = user;
      res.redirect('/dashboard');
    } else {
      res.redirect(`/login?error=${encodeURIComponent("Invalid email or password")}`);
    }
  });
});
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) { return res.redirect('/dashboard'); }
    res.redirect('/login');
  });
});

// Protected Routes
app.use(checkAuth);
app.use(loadContext);

app.get('/dashboard', (req, res) => {
    if (req.session.user.role === 'Administrator') {
        return res.redirect('/admin/dashboard');
    }
    const userType = req.session.user.register_type || 'Active';
    const cpdKey = (userType === 'Limited Licensee') ? 'cpd_hours_limited' : 'cpd_hours_active';
    const ethicsKey = (userType === 'Limited Licensee') ? 'ethics_hours_limited' : 'ethics_hours_active';
    const settingsSql = `SELECT key, value FROM settings WHERE key IN (?, ?)`;
    
    db.all(settingsSql, [cpdKey, ethicsKey], (err, settings) => {
        if (err) { return res.status(500).send("Error fetching settings."); }
        const requiredHours = {
            cpd: parseFloat(settings.find(s => s.key === cpdKey)?.value) || 12,
            ethics: parseFloat(settings.find(s => s.key === ethicsKey)?.value) || 2
        };

        let totals = { cpd: 0, ethics: 0 };
        if (res.locals.plan) {
            const activitiesSql = `SELECT hours, is_ethics FROM activities WHERE plan_id = ? AND status = 'Complete'`;
            db.all(activitiesSql, [res.locals.plan.id], (err, activities) => {
                if (err) { return res.status(500).send("Error getting activities."); }
                activities.forEach(activity => {
                    totals.cpd += parseFloat(activity.hours) || 0;
                    if (activity.is_ethics) { totals.ethics += parseFloat(activity.hours) || 0; }
                });
                res.render('dashboard', { title: 'Dashboard', totals, requiredHours });
            });
        } else {
            res.render('dashboard', { title: 'Dashboard', totals, requiredHours });
        }
    });
});
app.post('/plan/reset', (req, res) => {
    const findPlanSql = `SELECT id FROM plans WHERE user_id = ? AND year = ?`;
    db.get(findPlanSql, [req.session.user.id, new Date().getFullYear()], (err, plan) => {
        if (err || !plan) { return res.redirect('/dashboard'); }
        const deleteActivitiesSql = `DELETE FROM activities WHERE plan_id = ?`;
        db.run(deleteActivitiesSql, [plan.id], (err) => {
            if (err) { return res.redirect('/dashboard'); }
            const deletePlanSql = `DELETE FROM plans WHERE id = ?`;
            db.run(deletePlanSql, [plan.id], (err) => {
                if (err) { return res.redirect('/dashboard'); }
                req.session.planData = null;
                res.redirect('/dashboard');
            });
        });
    });
});
app.get('/profile', (req, res) => { res.render('profile', { title: 'My Profile' }); });
app.get('/overview', (req, res) => { res.render('overview', { title: 'Overview' }); });
app.get('/glossary', (req, res) => { res.render('glossary', { title: 'Glossary' }); });
app.get('/contact', (req, res) => { res.render('contact', { title: 'Contact Us' }); });
app.get('/faq', (req, res) => { res.render('faq', { title: 'FAQs' }); });
app.get('/accessibility', (req, res) => { res.render('accessibility', { title: 'Accessibility' }); });
app.get('/privacy', (req, res) => { res.render('privacy', { title: 'Privacy' }); });

app.get('/track-progress', getOrCreatePlan, (req, res) => {
    const planId = req.session.planData.id;
    const activitiesSql = `SELECT * FROM activities WHERE plan_id = ? ORDER BY id`;
    db.all(activitiesSql, [planId], (err, activities) => {
        if (err) { return res.redirect('/dashboard'); }
        const groupedActivities = activities.reduce((acc, act) => {
            if (!acc[act.competency_name]) acc[act.competency_name] = [];
            acc[act.competency_name].push(act);
            return acc;
        }, {});
        res.render('track-progress', { title: 'Track Your Progress', activities: groupedActivities, competencies: req.session.planData.competencies });
    });
});
app.post('/activities/:id/complete', (req, res) => {
    const sql = `UPDATE activities SET status = 'Complete', completion_date = ? WHERE id = ?`;
    db.run(sql, [new Date(), req.params.id], function(err) {
        if (err) { return res.status(500).json({ success: false }); }
        res.json({ success: true });
    });
});
app.post('/activities/:id/uncomplete', (req, res) => {
    const sql = `UPDATE activities SET status = 'Not Started', completion_date = NULL WHERE id = ?`;
    db.run(sql, [req.params.id], function(err) {
        if (err) { return res.status(500).json({ success: false }); }
        res.json({ success: true });
    });
});

// --- ADMIN ROUTES ---
app.get('/admin/dashboard', checkAdmin, (req, res) => {
    let registerTypeFilter = req.query.register_type || [];
    if (typeof registerTypeFilter === 'string') {
        registerTypeFilter = [registerTypeFilter];
    }
    const filters = {
        name: req.query.name || '',
        year: req.query.year || '',
        status: req.query.status || '',
        register_type: registerTypeFilter
    };
    const sortBy = req.query.sortBy || 'year';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const allowedSortColumns = ['userName', 'lawyer_id', 'register_type', 'year', 'status', 'completed_cpd', 'completed_ethics'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'year';
    
    let sql = `
        SELECT p.id, p.year, p.status, u.name as userName, u.lawyer_id, u.register_type,
        SUM(CASE WHEN a.status = 'Complete' THEN a.hours ELSE 0 END) as completed_cpd,
        SUM(CASE WHEN a.status = 'Complete' AND a.is_ethics = 1 THEN a.hours ELSE 0 END) as completed_ethics
        FROM plans p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN activities a ON p.id = a.plan_id
    `;
    const params = [];
    const conditions = [];
    if (filters.name) { conditions.push("u.name LIKE ?"); params.push(`%${filters.name}%`); }
    if (filters.year) { conditions.push("p.year = ?"); params.push(filters.year); }
    if (filters.status) { conditions.push("p.status = ?"); params.push(filters.status); }
    if (filters.register_type.length > 0) {
        const placeholders = filters.register_type.map(() => '?').join(',');
        conditions.push(`u.register_type IN (${placeholders})`);
        params.push(...filters.register_type);
    }

    if (conditions.length > 0) { sql += " WHERE " + conditions.join(" AND "); }
    sql += ` GROUP BY p.id ORDER BY ${safeSortBy} ${sortOrder}`;
    
    const settingsSql = `SELECT key, value FROM settings`;
    Promise.all([
        new Promise((resolve, reject) => db.all(settingsSql, (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)))
    ]).then(([settings, plans]) => {
        const requirements = {
            cpd_active: parseFloat(settings.find(s => s.key === 'cpd_hours_active')?.value) || 12,
            ethics_active: parseFloat(settings.find(s => s.key === 'ethics_hours_active')?.value) || 2,
            cpd_limited: parseFloat(settings.find(s => s.key === 'cpd_hours_limited')?.value) || 6,
            ethics_limited: parseFloat(settings.find(s => s.key === 'ethics_hours_limited')?.value) || 1
        };
        plans.forEach(plan => {
            const isLimited = plan.register_type === 'Limited Licensee';
            const req_cpd = isLimited ? requirements.cpd_limited : requirements.cpd_active;
            const req_ethics = isLimited ? requirements.ethics_limited : requirements.ethics_active;
            plan.isComplete = (plan.completed_cpd >= req_cpd && plan.completed_ethics >= req_ethics);
        });
        const sortLinks = {};
        allowedSortColumns.forEach(col => {
            const order = (sortBy === col && sortOrder === 'ASC') ? 'desc' : 'asc';
            const query = new URLSearchParams({ ...req.query, sortBy: col, sortOrder: order });
            sortLinks[col] = `?${query}`;
        });
        const sortIcons = {};
        allowedSortColumns.forEach(col => {
            sortIcons[col] = (sortBy === col) ? (sortOrder === 'ASC' ? '▲' : '▼') : '';
        });
        res.render('admin/dashboard', { title: 'Admin Dashboard', plans, filters, sortLinks, sortIcons });
    }).catch(err => {
        console.error("Error fetching data for admin dashboard:", err.message);
        return res.status(500).send("Could not retrieve plans.");
    });
});
app.get('/admin/plan/:id', checkAdmin, (req, res) => {
    const planId = req.params.id;
    const planSql = `SELECT plans.*, users.name as userName, users.lawyer_id FROM plans JOIN users ON plans.user_id = users.id WHERE plans.id = ?`;
    db.get(planSql, [planId], (err, plan) => {
        if (err || !plan) { return res.redirect('/admin/dashboard'); }
        const activitiesSql = `SELECT * FROM activities WHERE plan_id = ? ORDER BY id`;
        db.all(activitiesSql, [planId], (err, activities) => {
            if (err) { return res.redirect('/admin/dashboard'); }
            const competencies = JSON.parse(plan.competencies || '[]');
            const groupedActivities = activities.reduce((acc, act) => {
                if (!acc[act.competency_name]) acc[act.competency_name] = [];
                acc[act.competency_name].push(act);
                return acc;
            }, {});
            res.render('admin/view-plan', { title: 'View Member Plan', plan, competencies, activities: groupedActivities });
        });
    });
});
app.post('/admin/plan/:id/reopen', checkAdmin, (req, res) => {
    const sql = `UPDATE plans SET status = 'Draft' WHERE id = ?`;
    db.run(sql, [req.params.id], function(err) {
        if (err) { return res.redirect('/admin/dashboard'); }
        res.redirect('/admin/dashboard');
    });
});
app.get('/admin/competencies', checkAdmin, (req, res) => {
    const sql = `SELECT d.id as domain_id, d.name as domain_name, c.id as competency_id, c.name as competency_name FROM domains d LEFT JOIN competencies c ON d.id = c.domain_id ORDER BY d.id, c.id`;
    db.all(sql, [], (err, rows) => {
        if (err) { return res.redirect('/admin/dashboard'); }
        const domains = rows.reduce((acc, row) => {
            let domain = acc.find(d => d.id === row.domain_id);
            if (!domain) {
                domain = { id: row.domain_id, name: row.domain_name, competencies: [] };
                acc.push(domain);
            }
            if (row.competency_id) {
                domain.competencies.push({ id: row.competency_id, name: row.competency_name });
            }
            return acc;
        }, []);
        res.render('admin/manage-competencies', { title: 'Manage Competencies', domains });
    });
});
app.post('/admin/domains/add', checkAdmin, (req, res) => {
    const { domain_name } = req.body;
    if (domain_name) {
        db.run(`INSERT INTO domains (name) VALUES (?)`, [domain_name], (err) => {
            if (err) console.error(err.message);
            res.redirect('/admin/competencies');
        });
    } else { res.redirect('/admin/competencies'); }
});
app.post('/admin/competencies/add', checkAdmin, (req, res) => {
    const { domain_id, competency_name } = req.body;
    if (domain_id && competency_name) {
        db.run(`INSERT INTO competencies (name, domain_id) VALUES (?, ?)`, [competency_name, domain_id], (err) => {
            if (err) console.error(err.message);
            res.redirect('/admin/competencies');
        });
    } else { res.redirect('/admin/competencies'); }
});
app.post('/admin/competencies/delete/:id', checkAdmin, (req, res) => {
    db.run(`DELETE FROM competencies WHERE id = ?`, [req.params.id], (err) => {
        if (err) console.error(err.message);
        res.redirect('/admin/competencies');
    });
});
app.get('/admin/activities', checkAdmin, (req, res) => {
    db.all(`SELECT * FROM learning_activities ORDER BY description`, [], (err, activities) => {
        if(err) { return res.status(500).send("Could not retrieve activities."); }
        res.render('admin/manage-activities', { title: 'Manage Activities', activities });
    });
});
app.post('/admin/activities/add', checkAdmin, (req, res) => {
    const { description } = req.body;
    if (description) {
        db.run(`INSERT INTO learning_activities (description) VALUES (?)`, [description], (err) => {
            if (err) console.error(err.message);
            res.redirect('/admin/activities');
        });
    } else { res.redirect('/admin/activities'); }
});
app.post('/admin/activities/delete/:id', checkAdmin, (req, res) => {
    db.run(`DELETE FROM learning_activities WHERE id = ?`, [req.params.id], (err) => {
        if (err) console.error(err.message);
        res.redirect('/admin/activities');
    });
});
app.get('/admin/export/csv', checkAdmin, (req, res) => {
    const sql = `SELECT u.name as member_name, u.lawyer_id, p.year as plan_year, p.status as plan_status, ac.competency_name, ac.activity_description, ac.hours as planned_hours, CASE WHEN ac.is_ethics = 1 THEN 'Yes' ELSE 'No' END as is_ethics, ac.status as activity_status, ac.completion_date FROM plans p JOIN users u ON p.user_id = u.id LEFT JOIN activities ac ON p.id = ac.plan_id ORDER BY u.name, p.year, ac.id`;
    db.all(sql, [], (err, data) => {
        if (err) { return res.status(500).send("Could not export data."); }
        data.forEach(row => {
            if (row.completion_date) {
                const date = new Date(row.completion_date);
                row.completion_date = date.toISOString().split('T')[0];
            }
        });
        const fields = ['member_name', 'lawyer_id', 'plan_year', 'plan_status', 'competency_name', 'activity_description', 'planned_hours', 'is_ethics', 'activity_status', 'completion_date'];
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(data);
        res.header('Content-Type', 'text/csv');
        res.attachment(`cpd-export-${Date.now()}.csv`);
        res.send(csv);
    });
});
app.get('/admin/import-users', checkAdmin, (req, res) => {
    res.render('admin/import-users', { title: 'Import Users', results: null });
});
app.post('/admin/import-users', checkAdmin, upload.single('csvFile'), async (req, res) => {
    if (!req.file) { return res.status(400).send('No file uploaded.'); }
    const results = [];
    const importPromises = [];
    fs.createReadStream(req.file.path)
        .pipe(csv({ headers: ['name', 'email', 'lawyer_id', 'role', 'register_type'], skipLines: 1 }))
        .on('data', (row) => {
            const tempPassword = crypto.randomBytes(8).toString('hex');
            const importPromise = new Promise(async (resolve) => {
                try {
                    const hashedPassword = await bcrypt.hash(tempPassword, 10);
                    const sql = 'INSERT INTO users (name, email, lawyer_id, role, register_type, password) VALUES (?, ?, ?, ?, ?, ?)';
                    db.run(sql, [row.name, row.email, row.lawyer_id, row.role, row.register_type, hashedPassword], function(err) {
                        if (err) { results.push({ ...row, success: false, reason: 'Email or Lawyer ID may already exist.' });
                        } else { results.push({ ...row, success: true, tempPassword: tempPassword }); }
                        resolve();
                    });
                } catch (error) { results.push({ ...row, success: false, reason: 'Hashing error.' }); resolve(); }
            });
            importPromises.push(importPromise);
        })
        .on('end', async () => {
            await Promise.all(importPromises);
            fs.unlinkSync(req.file.path);
            res.render('admin/import-users', { title: 'Import Users', results: results });
        });
});

// --- WIZARD ROUTES ---
app.get('/wizard/continue', getOrCreatePlan, (req, res) => {
    const activitiesSql = `SELECT * FROM activities WHERE plan_id = ?`;
    db.all(activitiesSql, [req.session.planData.id], (err, activities) => {
        if(err) { return res.redirect('/dashboard'); }
        const furthestStep = calculateFurthestStep(req.session.planData, activities);
        const destinationStep = Math.max(3, furthestStep);
        res.redirect(`/wizard/${destinationStep}`);
    });
});
app.get('/wizard/:step', getOrCreatePlan, (req, res) => {
    const step = parseInt(req.params.step, 10);
    const planId = req.session.planData.id;
    const activitiesSql = `SELECT * FROM activities WHERE plan_id = ?`;
    db.all(activitiesSql, [planId], (err, activities) => {
        if (err) { return res.redirect('/dashboard'); }
        const furthestStep = calculateFurthestStep(req.session.planData, activities);
        if (step > furthestStep && step !== 1) { return res.redirect(`/wizard/${furthestStep}`); }

        const renderOptions = { title: 'CPD Self-Assessment', currentStep: step, furthestStep: furthestStep, competencies: req.session.planData.competencies };
        
        if (step === 3) {
            const domainSql = `SELECT d.name as domain_name, c.name as competency_name FROM domains d LEFT JOIN competencies c ON d.id = c.domain_id ORDER BY d.id, c.id`;
            db.all(domainSql, [], (err, rows) => {
                if (err) { return res.redirect('/dashboard'); }
                renderOptions.competencies = rows.reduce((acc, row) => {
                    let domain = acc.find(d => d.domain === row.domain_name);
                    if (!domain) { domain = { domain: row.domain_name, competencies: [] }; acc.push(domain); }
                    if (row.competency_name) { domain.competencies.push(row.competency_name); }
                    return acc;
                }, []);
                renderOptions.selectedCompetencies = req.session.planData.competencies;
                renderOptions.saved = req.query.saved || null;
                res.render(`wizard-step3`, renderOptions);
            });
        } else if (step === 6) {
            db.all(`SELECT * FROM learning_activities ORDER BY description`, [], (err, availableActivities) => {
                if(err) { return res.redirect('/dashboard'); }
                renderOptions.activities = activities.reduce((acc, act) => {
                    if (!acc[act.competency_name]) { acc[act.competency_name] = []; }
                    acc[act.competency_name].push(act);
                    return acc;
                }, {});
                renderOptions.availableActivities = availableActivities;
                res.render('wizard-step6', renderOptions);
            });
        } else if (step === 7) {
            let totals = { cpd: 0, ethics: 0 };
            activities.forEach(act => {
                totals.cpd += parseFloat(act.hours) || 0;
                if(act.is_ethics) { totals.ethics += parseFloat(act.hours) || 0; }
            });
            renderOptions.totals = totals;
            renderOptions.activities = activities.reduce((acc, act) => {
                if (!acc[act.competency_name]) { acc[act.competency_name] = []; }
                acc[act.competency_name].push(act);
                return acc;
            }, {});
            res.render('wizard-step7', renderOptions);
        } else {
             renderOptions.selectedCompetencies = req.session.planData.competencies;
             res.render(`wizard-step${step}`, renderOptions);
        }
    });
});
app.post('/wizard/submit', getOrCreatePlan, (req, res) => {
    const sql = `UPDATE plans SET status = 'Submitted' WHERE id = ?`;
    db.run(sql, [req.session.planData.id], function(err) {
        if (err) { return res.redirect(`/wizard/7`); }
        req.session.planData = null;
        res.redirect('/dashboard');
    });
});
app.get('/wizard/3/select/:competencyName', getOrCreatePlan, (req, res) => {
    const competencyName = decodeURIComponent(req.params.competencyName);
    if (!req.session.planData.competencies.some(c => c.name === competencyName)) {
        req.session.planData.competencies.push({ name: competencyName, type: 'standard', rating: null });
        savePlanProgress(req.session.planData, () => res.redirect('/wizard/3?saved=true'));
    } else { res.redirect('/wizard/3'); }
});
app.get('/wizard/3/remove/:competencyName', getOrCreatePlan, (req, res) => {
    const competencyName = decodeURIComponent(req.params.competencyName);
    req.session.planData.competencies = req.session.planData.competencies.filter(c => c.name !== competencyName);
    savePlanProgress(req.session.planData, () => res.redirect('/wizard/3?saved=true'));
});
app.post('/wizard/3/add-custom', getOrCreatePlan, (req, res) => {
    const customName = req.body.custom_competency;
    if (customName && !req.session.planData.competencies.some(c => c.name === customName)) {
        req.session.planData.competencies.push({ name: customName, type: 'custom', rating: null });
        savePlanProgress(req.session.planData, () => res.redirect('/wizard/3?saved=true'));
    } else { res.redirect('/wizard/3'); }
});
app.post('/wizard/4', getOrCreatePlan, (req, res) => {
    const { competencyName, rating } = req.body;
    const competencyToUpdate = req.session.planData.competencies.find(c => c.name === competencyName);
    if (competencyToUpdate) {
        competencyToUpdate.rating = rating;
        savePlanProgress(req.session.planData, (err) => {
            if (err) { return res.status(500).json({ success: false, message: 'Database error.' }); }
            res.json({ success: true, message: 'Rating saved.' });
        });
    } else { res.status(404).json({ success: false, message: 'Competency not found.' }); }
});
app.get('/wizard/5/move-up/:competencyName', getOrCreatePlan, (req, res) => {
    const competencyName = decodeURIComponent(req.params.competencyName);
    const competencies = req.session.planData.competencies;
    const index = competencies.findIndex(c => c.name === competencyName);
    if (index > 0) {
        [competencies[index], competencies[index - 1]] = [competencies[index - 1], competencies[index]];
        savePlanProgress(req.session.planData, () => res.redirect('/wizard/5'));
    } else { res.redirect('/wizard/5'); }
});
app.get('/wizard/5/move-down/:competencyName', getOrCreatePlan, (req, res) => {
    const competencyName = decodeURIComponent(req.params.competencyName);
    const competencies = req.session.planData.competencies;
    const index = competencies.findIndex(c => c.name === competencyName);
    if (index < competencies.length - 1) {
        [competencies[index], competencies[index + 1]] = [competencies[index + 1], competencies[index]];
        savePlanProgress(req.session.planData, () => res.redirect('/wizard/5'));
    } else { res.redirect('/wizard/5'); }
});
app.post('/wizard/6/add-activity', getOrCreatePlan, (req, res) => {
    const { competency_name, activity_title, activity_type, hours, notes, user_role_in_activity } = req.body;
    const is_ethics = req.body.is_ethics ? 1 : 0;
    const sql = `INSERT INTO activities (plan_id, competency_name, activity_title, activity_type, user_role_in_activity, hours, is_ethics, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [req.session.planData.id, competency_name, activity_title, activity_type, user_role_in_activity, hours, is_ethics, notes], function(err) {
        if (err) { return res.status(500).json({ success: false, message: err.message }); }
        res.json({ success: true, newActivity: { id: this.lastID, is_ethics, ...req.body } });
    });
});
app.post('/wizard/6/remove-activity/:id', getOrCreatePlan, (req, res) => {
    const sql = `DELETE FROM activities WHERE id = ? AND plan_id = ?`;
    db.run(sql, [req.params.id, req.session.planData.id], function(err) {
        if (err) { return res.status(500).json({ success: false }); }
        res.json({ success: true });
    });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Pauls Server is running successfully on http://localhost:${PORT}`);
});