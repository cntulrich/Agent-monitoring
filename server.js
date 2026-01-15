const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (your HTML app)
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'employee_tracker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
        console.error('Make sure PostgreSQL is running and credentials are correct');
    } else {
        console.log('✅ Database connected successfully at', res.rows[0].now);
    }
});

// API Routes

// Get all employees
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM employees ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT * FROM employees WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add employee
app.post('/api/employees', async (req, res) => {
    try {
        const { name, username, password, company, manager, work_type } = req.body;
        
        // Check if username already exists
        const existing = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const result = await pool.query(
            'INSERT INTO employees (name, username, password, role, company, manager, work_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, username, password, 'employee', company || 'N/A', manager || 'N/A', work_type]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error adding employee:', err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk import employees
app.post('/api/employees/bulk', async (req, res) => {
    try {
        const { employees } = req.body;
        const added = [];
        const errors = [];
        
        for (const emp of employees) {
            try {
                // Check if username exists
                const existing = await pool.query('SELECT * FROM employees WHERE username = $1', [emp.username]);
                if (existing.rows.length > 0) {
                    errors.push({ employee: emp.name, error: 'Username already exists' });
                    continue;
                }
                
                const result = await pool.query(
                    'INSERT INTO employees (name, username, password, role, company, manager, work_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
                    [emp.name, emp.username, emp.password, 'employee', emp.company, emp.manager, emp.workType]
                );
                added.push(result.rows[0]);
            } catch (err) {
                errors.push({ employee: emp.name, error: err.message });
            }
        }
        
        res.json({ added, errors, count: added.length });
    } catch (err) {
        console.error('Bulk import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clock_logs WHERE user_id = $1', [req.params.id]);
        await pool.query('DELETE FROM active_sessions WHERE user_id = $1', [req.params.id]);
        await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting employee:', err);
        res.status(500).json({ error: err.message });
    }
});

// Clock in
app.post('/api/clock-in', async (req, res) => {
    try {
        const { user_id, user_name, work_type, ip, location, geolocation } = req.body;
        
        // Check if already clocked in
        const existing = await pool.query('SELECT * FROM active_sessions WHERE user_id = $1', [user_id]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Already clocked in' });
        }
        
        const now = new Date();
        
        // Create log entry
        await pool.query(
            'INSERT INTO clock_logs (user_id, user_name, action, time, work_type, ip_address, location, geolocation) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [user_id, user_name, 'Clock In', now, work_type, ip, location, geolocation]
        );
        
        // Create active session
        await pool.query(
            'INSERT INTO active_sessions (user_id, clock_in_time) VALUES ($1, $2)',
            [user_id, now]
        );
        
        res.json({ success: true, time: now });
    } catch (err) {
        console.error('Clock in error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Clock out
app.post('/api/clock-out', async (req, res) => {
    try {
        const { user_id, user_name, work_type, ip, location, geolocation } = req.body;
        
        // Get active session
        const session = await pool.query('SELECT * FROM active_sessions WHERE user_id = $1', [user_id]);
        if (session.rows.length === 0) {
            return res.status(400).json({ error: 'Not clocked in' });
        }
        
        const clockInTime = new Date(session.rows[0].clock_in_time);
        const now = new Date();
        const minutes = Math.floor((now - clockInTime) / 60000);
        const duration = Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
        
        // Create log entry
        await pool.query(
            'INSERT INTO clock_logs (user_id, user_name, action, time, work_type, ip_address, location, geolocation, duration) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [user_id, user_name, 'Clock Out', now, work_type, ip, location, geolocation, duration]
        );
        
        // Delete active session
        await pool.query('DELETE FROM active_sessions WHERE user_id = $1', [user_id]);
        
        res.json({ success: true, duration, time: now });
    } catch (err) {
        console.error('Clock out error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get active session
app.get('/api/active-session/:user_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM active_sessions WHERE user_id = $1', [req.params.user_id]);
        res.json(result.rows[0] || null);
    } catch (err) {
        console.error('Error fetching active session:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all logs
app.get('/api/logs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clock_logs ORDER BY time DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get user logs
app.get('/api/logs/:user_id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM clock_logs WHERE user_id = $1 ORDER BY time DESC',
            [req.params.user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching user logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve the HTML app for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 Employee Tracker Server Started!');
    console.log('='.repeat(60));
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🌐 Access from network: http://YOUR_SERVER_IP:${PORT}`);
    console.log(`📊 Database: ${process.env.DB_NAME || 'employee_tracker'}`);
    console.log('='.repeat(60));
    console.log('✨ Ready to track employees!');
    console.log('='.repeat(60));
});
