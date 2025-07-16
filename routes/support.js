const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const emailService = require('../services/emailService');

// Support page
router.get('/', (req, res) => {
    // Get flash messages from session
    const success = req.session.flashSuccess;
    const error = req.session.flashError;
    
    // Clear flash messages after reading
    delete req.session.flashSuccess;
    delete req.session.flashError;
    
    res.render('support', { 
        title: 'Support - Get Help with Bulk Email Verification',
        activePage: 'support',
        currentPath: '/support',
        user: req.user || null,
        success: success || null,
        error: error || null
    });
});

// Handle contact form submission
router.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Basic validation
        if (!name || !email || !subject || !message) {
            req.session.flashError = 'All fields are required';
            return res.redirect('/support');
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            req.session.flashError = 'Please enter a valid email address';
            return res.redirect('/support');
        }

        // Log the submission
        console.log('Support Request Received:', {
            name,
            email,
            subject,
            message,
            submittedAt: new Date(),
            userAgent: req.get('User-Agent'),
            ip: req.ip
        });

        // Send email notification
        await emailService.sendSupportNotification({
            name,
            email,
            subject,
            message,
            submittedAt: new Date().toLocaleString(),
            userAgent: req.get('User-Agent'),
            ip: req.ip
        });

        req.session.flashSuccess = 'Your message has been sent successfully. We will get back to you within 24 hours.';
        res.redirect('/support');
    } catch (error) {
        console.error('Support form error:', error);
        req.session.flashError = 'Something went wrong. Please try again.';
        res.redirect('/support');
    }
});

module.exports = router;