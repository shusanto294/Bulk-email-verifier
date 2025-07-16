const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { requireGuest } = require('../middleware/auth');
const emailVerificationService = require('../services/emailVerificationService');

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

        // Validate email format and check for temporary emails
        const emailValidation = emailVerificationService.validateEmail(email);
        if (!emailValidation.isValid) {
            return res.render('auth/register', { 
                title: 'Register',
                error: emailValidation.reason,
                formData: req.body,
                success: null
            });
        }

        if (emailValidation.isTemporary) {
            return res.render('auth/register', { 
                title: 'Register',
                error: 'Temporary or disposable email addresses are not allowed. Please use a permanent email address.',
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
            password,
            role: 'customer' // Explicitly set customer role
        });

        await user.save();

        // Send verification email
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const emailResult = await emailVerificationService.sendVerificationEmail(user, baseUrl);

        if (emailResult.success) {
            res.render('auth/register', { 
                title: 'Register',
                error: null,
                formData: null,
                success: `Account created successfully! Please check your email (${email}) for a verification link. You must verify your email before you can log in.`
            });
        } else {
            // If email sending fails, still create the account but show a warning
            res.render('auth/register', { 
                title: 'Register',
                error: null,
                formData: null,
                success: `Account created successfully! However, we couldn't send the verification email. Please try to resend it from the login page.`
            });
        }
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

        // Check if email is verified
        if (!user.isEmailVerified) {
            return res.render('auth/login', { 
                title: 'Login',
                error: 'Please verify your email address before logging in. Check your email for a verification link.',
                formData: req.body,
                success: null,
                showResendLink: true,
                userEmail: user.email,
                userId: user._id
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

// Email verification route
router.get('/verify-email', async (req, res) => {
    try {
        const { token, id } = req.query;

        if (!token || !id) {
            return res.render('auth/verify-result', {
                title: 'Email Verification',
                success: false,
                message: 'Invalid verification link. Please check your email for the correct link.'
            });
        }

        const result = await emailVerificationService.verifyEmailToken(id, token);

        if (result.success) {
            res.render('auth/verify-result', {
                title: 'Email Verification',
                success: true,
                message: 'Email verified successfully! You can now log in to your account.'
            });
        } else {
            res.render('auth/verify-result', {
                title: 'Email Verification',
                success: false,
                message: result.error
            });
        }

    } catch (error) {
        console.error('Email verification error:', error);
        res.render('auth/verify-result', {
            title: 'Email Verification',
            success: false,
            message: 'An error occurred during email verification. Please try again.'
        });
    }
});

// Resend verification email route
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.json({
                success: false,
                error: 'Email is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({
                success: false,
                error: 'No account found with this email address'
            });
        }

        if (user.isEmailVerified) {
            return res.json({
                success: false,
                error: 'Email is already verified'
            });
        }

        // Send verification email
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const result = await emailVerificationService.sendVerificationEmail(user, baseUrl);

        res.json(result);

    } catch (error) {
        console.error('Resend verification error:', error);
        res.json({
            success: false,
            error: 'Failed to resend verification email'
        });
    }
});

// Check verification status
router.get('/verification-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId).select('isEmailVerified email');
        if (!user) {
            return res.json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            isVerified: user.isEmailVerified,
            email: user.email
        });

    } catch (error) {
        console.error('Verification status error:', error);
        res.json({
            success: false,
            error: 'Failed to check verification status'
        });
    }
});

// Forgot password page
router.get('/forgot-password', requireGuest, (req, res) => {
    res.render('auth/forgot-password', { 
        title: 'Forgot Password',
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// Send password reset email
router.post('/forgot-password', requireGuest, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.render('auth/forgot-password', { 
                title: 'Forgot Password',
                error: 'Email address is required',
                success: null
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('auth/forgot-password', { 
                title: 'Forgot Password',
                error: 'Invalid email format',
                success: null
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        
        // Always show success message for security (don't reveal if email exists)
        const successMessage = 'If an account with that email exists, we\'ve sent a password reset link to your email address.';
        
        if (user) {
            // Send password reset email
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const result = await emailVerificationService.sendPasswordResetEmail(user, baseUrl);
            
            if (!result.success) {
                return res.render('auth/forgot-password', { 
                    title: 'Forgot Password',
                    error: result.error,
                    success: null
                });
            }
        }

        res.render('auth/forgot-password', { 
            title: 'Forgot Password',
            error: null,
            success: successMessage
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.render('auth/forgot-password', { 
            title: 'Forgot Password',
            error: 'An error occurred. Please try again.',
            success: null
        });
    }
});

// Reset password page
router.get('/reset-password', requireGuest, async (req, res) => {
    try {
        const { token, id } = req.query;

        if (!token || !id) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Invalid password reset link. Please request a new one.',
                success: null,
                validToken: false
            });
        }

        // Verify token
        const result = await emailVerificationService.verifyPasswordResetToken(id, token);
        
        if (!result.success) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: result.error,
                success: null,
                validToken: false
            });
        }

        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: null,
            success: null,
            validToken: true,
            token: token,
            userId: id
        });

    } catch (error) {
        console.error('Reset password page error:', error);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            success: null,
            validToken: false
        });
    }
});

// Process password reset
router.post('/reset-password', requireGuest, async (req, res) => {
    try {
        const { token, userId, password, confirmPassword } = req.body;

        if (!token || !userId || !password || !confirmPassword) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'All fields are required',
                success: null,
                validToken: true,
                token: token,
                userId: userId
            });
        }

        if (password !== confirmPassword) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Passwords do not match',
                success: null,
                validToken: true,
                token: token,
                userId: userId
            });
        }

        if (password.length < 6) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: 'Password must be at least 6 characters long',
                success: null,
                validToken: true,
                token: token,
                userId: userId
            });
        }

        // Reset password
        const result = await emailVerificationService.resetUserPassword(userId, token, password);
        
        if (!result.success) {
            return res.render('auth/reset-password', {
                title: 'Reset Password',
                error: result.error,
                success: null,
                validToken: false
            });
        }

        res.redirect('/auth/login?success=Password reset successfully! You can now log in with your new password.');

    } catch (error) {
        console.error('Reset password error:', error);
        res.render('auth/reset-password', {
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            success: null,
            validToken: false
        });
    }
});

// Test email endpoint (for debugging SMTP configuration)
router.post('/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.json({
                success: false,
                error: 'Email address is required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.json({
                success: false,
                error: 'Invalid email format'
            });
        }

        const result = await emailVerificationService.sendTestEmail(email);
        res.json(result);

    } catch (error) {
        console.error('Test email error:', error);
        res.json({
            success: false,
            error: 'Failed to send test email'
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