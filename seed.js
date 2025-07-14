// seed.js

const db = require('./database.js');

const competencyData = [
    { 
        domain: "Ethics and Professionalism",
        competencies: ["Act ethically", "Demonstrate good character", "Use sound judgement"]
    },
    {
        domain: "Substantive Law and Practice Management",
        competencies: ["Manage files effectively and securely", "Commit to continuous improvement", "Cultivate a growth mindset"]
    },
    {
        domain: "Client Relationship Management",
        competencies: ["Determine suitability of lawyer-client relationships", "Establish lawyer-client relationships", "Engage in ongoing communication with clients", "Foster collaborative and trusting lawyer-client relationships"]
    },
    {
        domain: "Communication and Advocacy",
        competencies: ["Communicate effectively", "Advance client interests through advocacy", "Negotiate effectively", "Collaborate with others"]
    },
    {
        domain: "Cultural Competence, Equity, Diversity, and Inclusion",
        competencies: ["Build intelligence related to cultural competence, equity, diversity and inclusion", "Incorporate equity, diversity and inclusion in practice", "Champion enumerated groups in professional activities"]
    },
    {
        domain: "Well-being",
        competencies: ["Build resilience", "Maintain personal health", "Demonstrate self-awareness", "Support well-being of others"]
    },
    {
        domain: "Truth and Reconciliation",
        competencies: ["Strengthen understanding of the truth regarding the experience of Indigenous Peoples", "Demonstrate support for reconciliation with the Indigenous Peoples of Canada"]
    },
    {
        domain: "Analytical Skills",
        competencies: ["Critically evaluate a matter", "Identify and apply relevant legal principles", "Conduct legal research"]
    },
    {
        domain: "Professional Contributions",
        competencies: ["Foster collegiality and civility in the legal profession", "Enhance the administration of justice", "Advance access to legal services and access to justice"]
    }
];

db.serialize(() => {
    console.log("Seeding database with domains and competencies...");

    // Use a recursive function to insert data sequentially
    function seedDomains(index) {
        if (index >= competencyData.length) {
            console.log("Seeding complete.");
            db.close();
            return;
        }

        const item = competencyData[index];
        const domainSql = `INSERT INTO domains (name) VALUES (?)`;
        
        db.run(domainSql, [item.domain], function(err) {
            if (err) {
                console.log(`Skipping domain (already exists): ${item.domain}`);
                seedDomains(index + 1); // Move to next domain
                return;
            }
            
            const domainId = this.lastID;
            console.log(`Added domain: ${item.domain}`);

            const competencySql = `INSERT INTO competencies (name, domain_id) VALUES (?, ?)`;
            let completedCompetencies = 0;

            if (item.competencies.length === 0) {
                seedDomains(index + 1); // Move to next domain if no competencies
                return;
            }

            item.competencies.forEach(compName => {
                db.run(competencySql, [compName, domainId], function(err) {
                    if (err) {
                        console.log(`  - Skipping competency (already exists): ${compName}`);
                    } else {
                        console.log(`  - Added competency: ${compName}`);
                    }
                    completedCompetencies++;
                    if (completedCompetencies === item.competencies.length) {
                        seedDomains(index + 1); // Once all competencies for this domain are done, move to the next domain
                    }
                });
            });
        });
    }

    // Start the seeding process from the first domain
    seedDomains(0);
});