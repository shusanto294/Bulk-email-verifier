const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { requireGuest } = require('../middleware/auth');

// Register page
router.get('/register', requireGuest, (req, res) => {
    res.render('auth/register', { 
        title: 'Register',
        error: req.query.error || null,
        success: req.query.success || null,
        formData: null
    });
});

// Register user
router.post('/register', requireGuest, async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Validation
        if (!username || !email || !password || !confirmPassword) {
            return res.render('auth/register', { 
                title: 'Register',
                error: 'All fields are required',
                formData: req.body,
                success: null
            });
        }

        if (password !== confirmPassword) {
            return res.render('auth/register', { 
                title: 'Register',
                error: 'Passwords do not match',
                formData: req.body,
                success: null
            });
        }

        if (password.length < 6) {
            return res.render('auth/register', { 
                title: 'Register',
                error: 'Password must be at least 6 characters long',
                formData: req.body,
                success: null
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.render('auth/register', { 
                title: 'Register',
                error: 'Username or email already exists',
                formData: req.body,
                success: null
            });
        }

        // Create new user
        const user = new User({
            username,
            email,
            password
        });

        await user.save();

        // Set session
        req.session.userId = user._id;
        req.session.username = user.username;

        res.redirect('/dashboard?success=Account created successfully! You have 100 free credits to start.');
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', { 
            title: 'Register',
            error: 'Registration failed. Please try again.',
            formData: req.body,
            success: null
        });
    }
});

// Login page
router.get('/login', requireGuest, (req, res) => {
    res.render('auth/login', { 
        title: 'Login',
        error: req.query.error || null,
        success: req.query.success || null,
        formData: null
    });
});

// Login user
router.post('/login', requireGuest, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.render('auth/login', { 
                title: 'Login',
                error: 'Email and password are required',
                formData: req.body,
                success: null
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('auth/login', { 
                title: 'Login',
                error: 'Invalid email or password',
                formData: req.body,
                success: null
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('auth/login', { 
                title: 'Login',
                error: 'Invalid email or password',
                formData: req.body,
                success: null
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Set session
        req.session.userId = user._id;
        req.session.username = user.username;

        res.redirect('/dashboard?success=Welcome back!');
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', { 
            title: 'Login',
            error: 'Login failed. Please try again.',
            formData: req.body,
            success: null
        });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login?success=Logged out successfully');
    });
});

module.exports = router; 