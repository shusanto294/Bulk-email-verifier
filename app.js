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
        secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
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
        title: 'Professional Bulk Email Verifier - Validate & Verify Email Addresses',
        user: req.user || null,
        activePage: 'home',
        currentPath: '/'
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

        // Use deep-email-validator package with timeout
        const { validate } = require('deep-email-validator');
        
        const result = await Promise.race([
            validate({
                email: email,
                sender: process.env.SENDER_EMAIL || 'name@example.org'
            }),
            new Promise((resolve) => 
                setTimeout(() => resolve({ 
                    valid: false,
                    reason: 'timeout',
                    validators: {}
                }), 8000)
            )
        ]);

        if (result.reason === 'timeout') {
            return res.json({ 
                valid: false, 
                message: 'Email verification timed out. Please try again.' 
            });
        }

        const responseData = {
            valid: result.valid,
            message: result.valid ? 'Email address is valid and exists' : `Email is invalid: ${result.reason || 'Unknown reason'}`,
            details: {
                reason: result.reason,
                disposable: result.validators?.disposable?.valid === false,
                typo: result.validators?.typo?.valid === false,
                mx: result.validators?.mx?.valid || false,
                smtp: result.validators?.smtp?.valid || false,
                regex: result.validators?.regex?.valid || false,
                catchAll: result.validators?.mx?.valid && result.validators?.smtp?.valid === false
            }
        };

        res.json(responseData);
        
    } catch (error) {
        console.error('Email validation error:', error);
        res.json({ valid: false, message: 'An error occurred while validating the email' });
    }
});

// Sitemap route
app.get('/sitemap.xml', (req, res) => {
    const currentDate = new Date().toISOString().split('T')[0];
    const baseUrl = process.env.BASE_URL || 'https://bulk-email-verifier.bdwebguy.com';
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Main Application Pages -->
  <url>
    <loc>${baseUrl}/dashboard</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/upload</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/payments/buy-credits</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/support</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- Authentication Pages -->
  <url>
    <loc>${baseUrl}/auth/login</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/auth/register</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  
  <!-- Legal Pages -->
  <url>
    <loc>${baseUrl}/legal/terms-of-service</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/legal/privacy-policy</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/legal/refund-policy</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <!-- Payment Pages -->
  <url>
    <loc>${baseUrl}/payments/history</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>`;
    
    res.type('application/xml');
    res.send(sitemap);
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