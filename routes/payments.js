const express = require('express');
const router = express.Router();
const Payment = require('../models/payment');
const paymentService = require('../services/paymentService');
const { requireAuth } = require('../middleware/auth');

// Buy credits page
router.get('/buy-credits', requireAuth, async (req, res) => {
    try {
        const paymentMethods = paymentService.getAvailablePaymentMethods();
        const creditPackages = paymentService.getCreditPackages();
        
        res.render('payments/buy-credits', {
            title: 'Buy Credits',
            activePage: 'buy-credits',
            user: req.user,
            paymentMethods,
            creditPackages,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Buy credits page error:', error);
        res.status(500).send('Server Error');
    }
});

// Create Paddle checkout session
router.post('/create-paddle-checkout', requireAuth, async (req, res) => {
    try {
        const { package: packageType, price, credits } = req.body;

        // Validate input
        if (!packageType || !price || !credits) {
            return res.status(400).json({ 
                success: false, 
                error: 'Package, price, and credits are required' 
            });
        }

        // Validate package type
        const validPackages = ['10k', '50k', '100k'];
        if (!validPackages.includes(packageType)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid package type' 
            });
        }

        // Create Paddle checkout
        const result = await paymentService.createPaddleCheckout(
            req.user._id, 
            parseInt(credits), 
            packageType
        );

        res.json(result);

    } catch (error) {
        console.error('Create Paddle checkout error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create checkout' 
        });
    }
});

// Payment success page
router.get('/success', requireAuth, async (req, res) => {
    try {
        const { transaction_id } = req.query;
        
        res.render('payments/success', {
            title: 'Payment Successful',
            activePage: 'success',
            user: req.user,
            transactionId: transaction_id
        });
    } catch (error) {
        console.error('Payment success page error:', error);
        res.status(500).send('Server Error');
    }
});

// Payment status check
router.get('/status/:paymentId', requireAuth, async (req, res) => {
    try {
        const { paymentId } = req.params;

        const result = await paymentService.getPaymentStatus(paymentId);

        if (!result.success) {
            return res.status(404).json({ 
                success: false, 
                error: 'Payment not found' 
            });
        }

        res.json(result);

    } catch (error) {
        console.error('Payment status error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get payment status' 
        });
    }
});

// Payment history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.render('payments/history', {
            title: 'Payment History',
            activePage: 'history',
            user: req.user,
            payments
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).send('Server Error');
    }
});

// Paddle webhook
router.post('/webhook', async (req, res) => {
    try {
        // Process Paddle webhook
        await paymentService.processPaddleWebhook(req.body);

        res.status(200).send('OK');

    } catch (error) {
        console.error('Paddle webhook error:', error);
        res.status(500).send('Webhook processing failed');
    }
});

// Get available payment methods (API)
router.get('/methods', requireAuth, (req, res) => {
    try {
        const methods = paymentService.getAvailablePaymentMethods();
        res.json({
            success: true,
            methods
        });
    } catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get payment methods' 
        });
    }
});

// Get credit packages (API)
router.get('/packages', requireAuth, (req, res) => {
    try {
        const packages = paymentService.getCreditPackages();
        res.json({
            success: true,
            packages
        });
    } catch (error) {
        console.error('Get credit packages error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get credit packages' 
        });
    }
});

// Test API connection (for debugging)
router.get('/test-api', requireAuth, async (req, res) => {
    try {
        const connectionTest = await paymentService.testApiConnection();
        const currenciesTest = await paymentService.getAvailableCurrencies();
        
        res.json({
            success: true,
            connection: connectionTest,
            currencies: currenciesTest
        });
    } catch (error) {
        console.error('API test error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to test API' 
        });
    }
});

module.exports = router; 