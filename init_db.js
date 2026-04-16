const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Priyasharma@1311',
    multipleStatements: true
});

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL.');

    connection.query(schema, (err, results) => {
        if (err) throw err;
        console.log('Schema created successfully.');

        // Use service_app to seed
        connection.changeUser({ database: 'service_app' }, function (err) {
            if (err) throw err;
            seedProviders();
        });
    });
});

function seedProviders() {
    const providers = [
        ['Ramesh Electrician', 'Electrician', 5, 'Jaipur - Malviya Nagar', '9876543210', 4.8, false],
        ['Amit Plumber', 'Plumber', 6, 'Jaipur - Vaishali Nagar', '9876543211', 4.7, true],
        ['Riya Tutor', 'Tutor', 3, 'Jaipur - Mansarovar', '9876543212', 4.9, false],
        ['Suresh Electrician', 'Electrician', 4, 'Jaipur - C Scheme', '9876543213', 4.5, true],
        ['Priya Cleaners', 'Cleaning', 2, 'Jaipur - Jhotwara', '9876543214', 4.2, false]
    ];

    const insertQuery = 'INSERT INTO providers (name, category, experience, location, contact, rating, is_emergency) VALUES ?';

    // Check if table is empty
    connection.query("SELECT COUNT(*) as count FROM providers", (err, result) => {
        if (err) throw err;
        if (result[0].count === 0) {
            connection.query(insertQuery, [providers], (err, res) => {
                if (err) throw err;
                console.log('Seeded database with mock providers.');
                connection.end();
            });
        } else {
            console.log('Providers table already has data, skipping seed.');
            connection.end();
        }
    });
}
