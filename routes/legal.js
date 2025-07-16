const express = require('express');
const router = express.Router();

// Terms of Service page
router.get('/terms-of-service', (req, res) => {
    res.render('legal/terms-of-service', {
        title: 'Terms of Service - Bulk Email Verifier Legal Information',
        activePage: 'terms',
        currentPath: '/legal/terms-of-service'
    });
});

// Privacy Policy page
router.get('/privacy-policy', (req, res) => {
    res.render('legal/privacy-policy', {
        title: 'Privacy Policy - How We Protect Your Email Verification Data',
        activePage: 'privacy',
        currentPath: '/legal/privacy-policy'
    });
});

// Refund Policy page
router.get('/refund-policy', (req, res) => {
    res.render('legal/refund-policy', {
        title: 'Refund Policy - Bulk Email Verifier Money Back Guarantee',
        activePage: 'refund',
        currentPath: '/legal/refund-policy'
    });
});

module.exports = router;