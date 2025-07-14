const express = require('express');
const router = express.Router();

// Terms of Service page
router.get('/terms-of-service', (req, res) => {
    res.render('legal/terms-of-service', {
        title: 'Terms of Service',
        activePage: 'terms'
    });
});

// Privacy Policy page
router.get('/privacy-policy', (req, res) => {
    res.render('legal/privacy-policy', {
        title: 'Privacy Policy',
        activePage: 'privacy'
    });
});

// Refund Policy page
router.get('/refund-policy', (req, res) => {
    res.render('legal/refund-policy', {
        title: 'Refund Policy',
        activePage: 'refund'
    });
});

module.exports = router;