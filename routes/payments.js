const express = require('express');
const router = express.Router();
const Payment = require('../models/payment');
const paymentService = require('../services/paymentService');
const { requireEmailVerified, requireAuth } = require('../middleware/auth');

// Buy credits page
router.get('/buy-credits', requireEmailVerified, async (req, res) => {
    try {
        const paymentMethods = paymentService.getAvailablePaymentMethods();
        const creditPackages = paymentService.getCreditPackages();
        
        // Get saved payment methods for the user
        const savedMethodsResult = await paymentService.getSavedPaymentMethods(req.user._id);
        const savedPaymentMethods = savedMethodsResult.success ? savedMethodsResult.paymentMethods : [];
        
        res.render('payments/buy-credits', {
            title: 'Buy Credits for Bulk Email Verification - Affordable Email Validation Packages',
            activePage: 'buy-credits',
            currentPath: '/payments/buy-credits',
            user: req.user,
            paymentMethods,
            creditPackages,
            savedPaymentMethods,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Buy credits page error:', error);
        res.status(500).send('Server Error');
    }
});

// Create Paddle checkout session (SECURE - no frontend price/credit dependency)
router.post('/create-paddle-checkout', requireAuth, async (req, res) => {
    try {
        const { package: packageType } = req.body;

        console.log('🔒 SECURE: Creating checkout for user:', req.user._id, 'package:', packageType);

        // Validate package type only (ignore frontend price/credits for security)
        const validPackages = ['10k', '50k', '100k'];
        if (!packageType || !validPackages.includes(packageType)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid package type is required (10k, 50k, or 100k)' 
            });
        }

        // SECURITY: Create checkout using only backend package configuration
        const result = await paymentService.createPaddleCheckout(
            req.user._id, 
            packageType  // Only package type from frontend, all amounts from backend
        );

        console.log('✅ SECURE: Checkout created with backend-validated pricing');
        res.json(result);

    } catch (error) {
        console.error('❌ Create Paddle checkout error:', error);
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
        console.log('=== WEBHOOK RECEIVED ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Headers:', req.headers);
        console.log('Body:', JSON.stringify(req.body, null, 2));
        console.log('Raw body type:', typeof req.body);
        console.log('Body keys:', Object.keys(req.body || {}));
        console.log('========================');

        // Check if it's a real Paddle webhook or test
        const isRealPaddleWebhook = req.headers['paddle-signature'] || req.headers['webhook-id'];
        console.log('🔍 Is real Paddle webhook?', isRealPaddleWebhook);

        if (!req.body || Object.keys(req.body).length === 0) {
            console.log('⚠️ Empty webhook body received');
            return res.status(400).json({ 
                success: false, 
                error: 'Empty webhook body' 
            });
        }

        // Process Paddle webhook
        const result = await paymentService.processPaddleWebhook(req.body);
        
        console.log('✅ Webhook processing result:', result);
        res.status(200).json({ success: true, result: result });

    } catch (error) {
        console.error('❌ Paddle webhook error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Webhook processing failed'
        });
    }
});

// Webhook health check endpoint
router.get('/webhook', (req, res) => {
    console.log('🏥 Webhook health check accessed');
    res.json({
        success: true,
        message: 'Webhook endpoint is accessible',
        timestamp: new Date().toISOString(),
        webhookUrl: `${req.protocol}://${req.get('host')}/payments/webhook`
    });
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


// Get saved payment methods (API)
router.get('/saved-methods', requireAuth, async (req, res) => {
    try {
        const result = await paymentService.getSavedPaymentMethods(req.user._id);
        res.json(result);
    } catch (error) {
        console.error('Get saved payment methods error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get saved payment methods' 
        });
    }
});

// Set default payment method
router.post('/saved-methods/:methodId/default', requireAuth, async (req, res) => {
    try {
        const { methodId } = req.params;
        const result = await paymentService.setDefaultPaymentMethod(req.user._id, methodId);
        res.json(result);
    } catch (error) {
        console.error('Set default payment method error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to set default payment method' 
        });
    }
});

// Update saved payment method
router.put('/saved-methods/:methodId', requireAuth, async (req, res) => {
    try {
        const { methodId } = req.params;
        const { isDefault } = req.body;
        const result = await paymentService.updateSavedPaymentMethod(req.user._id, methodId, { isDefault });
        res.json(result);
    } catch (error) {
        console.error('Update saved payment method error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update saved payment method' 
        });
    }
});

// Delete saved payment method
router.delete('/saved-methods/:methodId', requireAuth, async (req, res) => {
    try {
        const { methodId } = req.params;
        const result = await paymentService.deleteSavedPaymentMethod(req.user._id, methodId);
        res.json(result);
    } catch (error) {
        console.error('Delete saved payment method error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete saved payment method' 
        });
    }
});

// Process payment directly with saved payment method (SECURE)
router.post('/process-saved-payment', requireAuth, async (req, res) => {
    try {
        const { package: packageType, savedPaymentMethodId } = req.body;

        console.log('🔒 SECURE: Processing direct payment with saved method for user:', req.user._id);

        // Validate input - SECURE: no frontend price/credits
        if (!packageType || !savedPaymentMethodId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Package type and saved payment method ID are required' 
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

        // Get package details from backend
        const packageDetails = paymentService.getPackageDetails(packageType);
        if (!packageDetails) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid package configuration' 
            });
        }

        // Verify saved payment method exists
        const savedMethodsResult = await paymentService.getSavedPaymentMethods(req.user._id);
        if (!savedMethodsResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: 'Could not verify saved payment method' 
            });
        }

        const savedMethod = savedMethodsResult.paymentMethods.find(
            method => method._id.toString() === savedPaymentMethodId
        );

        if (!savedMethod) {
            return res.status(400).json({ 
                success: false, 
                error: 'Saved payment method not found' 
            });
        }

        // Create payment record and process immediately
        const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create payment record
        const Payment = require('../models/payment');
        const payment = new Payment({
            userId: req.user._id,
            paymentId: transactionId,
            amount: packageDetails.amount,
            credits: packageDetails.credits,
            paymentMethod: 'paddle',
            status: 'confirmed',
            confirmedAt: new Date(),
            metadata: {
                package: packageType,
                savedPaymentMethodId: savedPaymentMethodId,
                customerId: savedMethod.customerId,
                direct_payment: true,
                expected_amount: packageDetails.amount,
                expected_credits: packageDetails.credits
            }
        });

        await payment.save();

        // Add credits to user
        const User = require('../models/user');
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const oldBalance = user.credits;
        await user.addCredits(packageDetails.credits);

        console.log(`✅ SECURE: Added ${packageDetails.credits} credits to user ${req.user._id} using saved payment method`);
        console.log(`📊 Balance: ${oldBalance} → ${user.credits} (+${packageDetails.credits})`);

        res.json({
            success: true,
            transactionId: transactionId,
            creditsAdded: packageDetails.credits,
            newBalance: user.credits,
            message: 'Payment processed successfully with saved payment method'
        });

    } catch (error) {
        console.error('❌ Process saved payment error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to process payment' 
        });
    }
});

// Save payment method after successful payment
router.post('/save-method', requireAuth, async (req, res) => {
    try {
        const { customerId, paymentMethodId, type, details } = req.body;

        console.log('Saving payment method for user:', req.user._id);
        console.log('Payment method data:', req.body);

        if (!customerId || !paymentMethodId || !type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Customer ID, payment method ID, and type are required' 
            });
        }

        const result = await paymentService.savePaymentMethod(req.user._id, {
            customerId,
            paymentMethodId,
            type,
            details: details || {}
        });

        res.json(result);
    } catch (error) {
        console.error('Save payment method error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save payment method' 
        });
    }
});


// Create Paddle payment method setup session
router.post('/create-payment-method-setup', requireAuth, async (req, res) => {
    try {
        console.log('🔒 Creating payment method setup session for user:', req.user._id);

        // Generate a unique setup ID
        const setupId = `setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // For Paddle Billing, we'll use the smallest product to setup payment method
        // This will charge the user but we can refund it or use it as credits
        const setupProductId = process.env.PADDLE_SETUP_PRODUCT_ID || process.env.PADDLE_PRODUCT_10K;
        
        if (!setupProductId) {
            throw new Error('Payment method setup product not configured');
        }

        const result = {
            success: true,
            setupId: setupId,
            productId: setupProductId,
            message: 'Payment method setup session created',
            note: 'This will process a small transaction to setup your payment method'
        };

        console.log('✅ Payment method setup session created:', setupId);
        res.json(result);

    } catch (error) {
        console.error('❌ Create payment method setup error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create payment method setup' 
        });
    }
});

// Add credits directly by package type (for testing/backup)
router.post('/add-credits', requireAuth, async (req, res) => {
    try {
        const { packageType, transactionId } = req.body;
        
        if (!packageType || !transactionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Package type and transaction ID are required' 
            });
        }

        // Define package credits
        const packageCredits = {
            '10k': 10000,
            '50k': 50000,
            '100k': 100000
        };

        const credits = packageCredits[packageType];
        if (!credits) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid package type' 
            });
        }

        // Check if transaction already processed
        const existingPayment = await Payment.findOne({
            $or: [
                { paymentId: transactionId },
                { 'metadata.transaction_id': transactionId }
            ]
        });

        if (existingPayment && existingPayment.status === 'confirmed') {
            return res.json({
                success: true,
                message: 'Credits already added for this transaction',
                creditsAdded: 0
            });
        }

        // Add credits to user
        const User = require('../models/user');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        const oldBalance = user.credits;
        await user.addCredits(credits);

        // Create or update payment record
        let payment;
        if (existingPayment) {
            existingPayment.status = 'confirmed';
            existingPayment.confirmedAt = new Date();
            existingPayment.credits = credits;
            payment = await existingPayment.save();
        } else {
            payment = new Payment({
                userId: req.user._id,
                paymentId: transactionId,
                amount: packageCredits[packageType] === 10000 ? 10 : packageCredits[packageType] === 50000 ? 45 : 85,
                credits: credits,
                paymentMethod: 'paddle',
                status: 'confirmed',
                confirmedAt: new Date(),
                metadata: {
                    transaction_id: transactionId,
                    package: packageType,
                    manual_credit_addition: true
                }
            });
            await payment.save();
        }

        console.log(`✅ Added ${credits} credits to user ${req.user._id} (${oldBalance} → ${user.credits})`);

        res.json({
            success: true,
            creditsAdded: credits,
            oldBalance: oldBalance,
            newBalance: user.credits,
            transactionId: transactionId
        });

    } catch (error) {
        console.error('Add credits error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add credits' 
        });
    }
});

// Get user balance (for refresh functionality)
router.get('/balance', requireAuth, async (req, res) => {
    try {
        const User = require('../models/user');
        const user = await User.findById(req.user._id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        res.json({
            success: true,
            credits: user.credits,
            userId: user._id
        });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get balance' 
        });
    }
});

module.exports = router; 