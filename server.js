const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the current directory
app.use(express.static(__dirname));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Priyasharma@1311',
    database: 'service_app',
    multipleStatements: true
});

db.connect(err => {
    if (err) {
        console.log('Database connection failed - please make sure MySQL is running and service_app DB exists.', err.message);
    } else {
        console.log('Connected to MySQL service_app Database.');
    }
});

// Middleware to check auth
const requireAuth = (req, res, next) => {
    if (!req.cookies.userId) {
        return res.status(401).json({ error: 'Unauthorized, please login first.' });
    }
    req.userId = req.cookies.userId;
    next();
};

/* --- AUTHENTICATION ROUTES --- */

app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Signup successful! Please log in.' });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });

    db.query('SELECT * FROM users WHERE email=?', [email], async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

        const user = result[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            // Setup cookie for 1 day
            res.cookie('userId', user.id, { maxAge: 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
            res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } });
        } else {
            res.status(401).json({ error: 'Invalid email or password' });
        }
    });
});

app.get('/api/logout', (req, res) => {
    res.clearCookie('userId');
    res.json({ message: 'Logged out successfully' });
});

/* --- PROVIDER ROUTES --- */

app.get('/api/providers', (req, res) => {
    const { search, category, location, emergency } = req.query;
    let query = 'SELECT * FROM providers WHERE 1=1';
    let params = [];

    if (search) {
        query += ' AND name LIKE ?';
        params.push(`%${search}%`);
    }
    if (category) {
        query += ' AND category = ?';
        params.push(category);
    }
    if (location) {
        query += ' AND location LIKE ?';
        params.push(`%${location}%`);
    }
    if (emergency === 'true') {
        query += ' AND is_emergency = 1';
    }

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/providers/:id', (req, res) => {
    db.query('SELECT * FROM providers WHERE id=?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Provider not found' });
        res.json(results[0]);
    });
});

/* --- BOOKING ROUTES --- */

app.post('/api/bookings', requireAuth, (req, res) => {
    const { provider_id, date, time } = req.body;
    if (!provider_id || !date || !time) return res.status(400).json({ error: 'Missing booking details' });

    db.query('INSERT INTO bookings (user_id, provider_id, date, time) VALUES (?, ?, ?, ?)',
        [req.userId, provider_id, date, time], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Booking successful', bookingId: result.insertId });
        });
});

app.get('/api/bookings', requireAuth, (req, res) => {
    const query = `
        SELECT b.id, b.date, b.time, b.status, p.name as provider_name, p.category 
        FROM bookings b
        JOIN providers p ON b.provider_id = p.id
        WHERE b.user_id = ?
        ORDER BY b.date DESC
    `;
    db.query(query, [req.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

/* --- REVIEWS ROUTES --- */

app.post('/api/reviews', requireAuth, (req, res) => {
    const { provider_id, rating, comment } = req.body;
    db.query('INSERT INTO reviews (user_id, provider_id, rating, comment) VALUES (?, ?, ?, ?)',
        [req.userId, provider_id, rating, comment], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            // Recalculate average rating for provider
            db.query('SELECT AVG(rating) as avg_rating FROM reviews WHERE provider_id=?', [provider_id], (avgErr, avgRes) => {
                if (!avgErr && avgRes.length > 0) {
                    db.query('UPDATE providers SET rating=? WHERE id=?', [avgRes[0].avg_rating, provider_id]);
                }
            });
            res.json({ message: 'Review added successfully' });
        });
});

app.get('/api/providers/:id/reviews', (req, res) => {
    const query = `
        SELECT r.rating, r.comment, u.name as user_name 
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.provider_id = ?
    `;
    db.query(query, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

/* --- FAVORITES ROUTES --- */

app.post('/api/favorites', requireAuth, (req, res) => {
    const { provider_id } = req.body;
    db.query('INSERT INTO favorites (user_id, provider_id) VALUES (?, ?)', [req.userId, provider_id], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return db.query('DELETE FROM favorites WHERE user_id=? AND provider_id=?', [req.userId, provider_id], (dErr) => {
                    if (dErr) return res.status(500).json({ error: dErr.message });
                    res.json({ message: 'Removed from favorites', isFavorite: false });
                });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Added to favorites', isFavorite: true });
    });
});

app.get('/api/favorites', requireAuth, (req, res) => {
    const query = `
        SELECT p.* 
        FROM favorites f
        JOIN providers p ON f.provider_id = p.id
        WHERE f.user_id = ?
    `;
    db.query(query, [req.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

/* --- COST ESTIMATOR ROUTE --- */
app.get('/api/estimate', (req, res) => {
    const { category, scale } = req.query;
    let basePrice = 0;

    switch (category?.toLowerCase()) {
        case 'plumber': basePrice = 500; break;
        case 'electrician': basePrice = 400; break;
        case 'tutor': basePrice = 1000; break;
        case 'cleaning': basePrice = 800; break;
        default: basePrice = 500;
    }

    // Scale factor (Small = 1, Medium = 1.5, Large = 2)
    const factor = scale === 'Large' ? 2 : (scale === 'Medium' ? 1.5 : 1);
    const estimatedCost = basePrice * factor;

    res.json({ category, scale, estimatedCost: `₹${estimatedCost} - ₹${estimatedCost + 500}` });
});

/* --- CHAT SYSTEM (MESSAGES) ROUTES --- */
app.post('/api/messages', requireAuth, (req, res) => {
    const { receiver_id, message } = req.body;
    db.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
        [req.userId, receiver_id, message], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Message sent successfully' });
        });
});

app.get('/api/messages/:userId', requireAuth, (req, res) => {
    const otherUserId = req.params.userId;
    const query = `
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY timestamp ASC
    `;
    db.query(query, [req.userId, otherUserId, otherUserId, req.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

/* --- FEEDBACK ROUTES --- */
app.post('/api/feedback', (req, res) => {
    const { name, email, category, rating, message } = req.body;
    if (!name || !email || !rating || !message) {
        return res.status(400).json({ error: 'Name, email, rating and message are required.' });
    }
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    // Link to a logged-in user if cookie present
    const userId = req.cookies.userId || null;

    db.query(
        'INSERT INTO feedback (user_id, name, email, category, rating, message) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, email, category || 'General', rating, message],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Thank you for your feedback!' });
        }
    );
});

app.get('/api/feedback', (req, res) => {
    db.query(
        'SELECT id, name, category, rating, message, created_at FROM feedback ORDER BY created_at DESC LIMIT 20',
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

/* --- FALLBACK ROUTE --- */
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});