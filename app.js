require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const paymentRoutes = require('./routes/payments');
const supportRoutes = require('./routes/support');
const legalRoutes = require('./routes/legal');
const { getCurrentUser } = require('./middleware/auth');

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware - must be before routes
app.use(getCurrentUser);

// Ensure layout variables are available for authenticated routes
app.use((req, res, next) => {
    if (req.user) {
        res.locals.user = req.user;
        res.locals.title = res.locals.title || 'Bulk Email Verifier';
        res.locals.activePage = res.locals.activePage || '';
    }
    next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Disable layout for auth routes and homepage
app.use('/auth', (req, res, next) => {
    res.locals.layout = false;
    next();
});

// Homepage will use the layout system

// Routes
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/payments', paymentRoutes);
app.use('/upload', uploadRoutes);
app.use('/support', supportRoutes);
app.use('/legal', legalRoutes);
app.use('/api', require('./routes/api'));

// Home route - show homepage for all users (authenticated and non-authenticated)
app.get('/', (req, res) => {
    res.render('homepage', { 
        title: 'Bulk Email Verifier - Professional Email Validation Service',
        user: req.user || null,
        activePage: 'home'
    });
});

// Email validation API endpoint
app.post('/api/validate-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({ valid: false, message: 'Email address is required' });
        }

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({ valid: false, message: 'Invalid email format' });
        }

        // Use email-existence package to check if email exists
        const emailExistence = require('email-existence');
        
        emailExistence.check(email, (error, response) => {
            if (error) {
                console.error('Email validation error:', error);
                return res.json({ valid: false, message: 'Unable to verify email at this time' });
            }
            
            if (response) {
                res.json({ valid: true, message: 'Email address is valid and exists' });
            } else {
                res.json({ valid: false, message: 'Email address does not exist' });
            }
        });
        
    } catch (error) {
        console.error('Email validation error:', error);
        res.json({ valid: false, message: 'An error occurred while validating the email' });
    }
});

// Find available port starting from 3000
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('Server and DB connections closed');
            process.exit(0);
        });
    });
});

// Handle port in use errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is in use, trying ${PORT + 1}`);
        app.listen(PORT + 1);
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});