-- Employee Tracker Database Setup
-- Run this in pgAdmin or psql

-- Create database (run this first as postgres user)
-- CREATE DATABASE employee_tracker;

-- Connect to employee_tracker database, then run below:

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS clock_logs CASCADE;
DROP TABLE IF EXISTS active_sessions CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- Create employees table
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    company VARCHAR(255),
    manager VARCHAR(255),
    work_type VARCHAR(50) DEFAULT 'office',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create clock_logs table
CREATE TABLE clock_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    time TIMESTAMP NOT NULL,
    work_type VARCHAR(50),
    ip_address VARCHAR(100),
    location VARCHAR(255),
    geolocation VARCHAR(255),
    duration VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create active_sessions table (tracks who is currently clocked in)
CREATE TABLE active_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
    clock_in_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_clock_logs_user_id ON clock_logs(user_id);
CREATE INDEX idx_clock_logs_time ON clock_logs(time);
CREATE INDEX idx_active_sessions_user_id ON active_sessions(user_id);

-- Insert default admin user
INSERT INTO employees (name, username, password, role, company, manager, work_type)
VALUES ('Admin User', 'admin', 'admin123', 'admin', 'N/A', 'N/A', 'office');

-- Insert test employee
INSERT INTO employees (name, username, password, role, company, manager, work_type)
VALUES ('John Doe', 'john', 'pass123', 'employee', 'ABC Corp', 'Admin User', 'hybrid');

-- Verify installation
SELECT 'Database setup complete!' as message;
SELECT * FROM employees;
