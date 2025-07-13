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

// Disable layout for auth routes
app.use('/auth', (req, res, next) => {
    res.locals.layout = false;
    next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/payments', paymentRoutes);
app.use('/upload', uploadRoutes);
app.use('/api', require('./routes/api'));

// Home route - redirect to login if not authenticated, otherwise to dashboard
app.get('/', (req, res) => {
    if (!req.session.userId) {
        res.redirect('/auth/login');
    } else {
        res.redirect('/dashboard');
    }
});

// Find available port starting from 3001
const PORT = process.env.PORT || 3001;
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