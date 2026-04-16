const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Priyasharma@1311',
    database: 'service_app'
});

db.connect(err => {
    if (err) { console.log('Connection failed:', err.message); process.exit(1); }

    const sql = `
        CREATE TABLE IF NOT EXISTS feedback (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT NULL,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            category VARCHAR(100) DEFAULT 'General',
            rating INT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `;

    db.query(sql, (err) => {
        if (err) console.log('Error:', err.message);
        else console.log('✅ feedback table created (or already exists)!');
        db.end();
    });
});
