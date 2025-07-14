const axios = require('axios');
const Payment = require('../models/payment');
const User = require('../models/user');
const SavedPaymentMethod = require('../models/savedPaymentMethod');

class PaymentService {
    constructor() {
        this.paddleVendorId = process.env.PADDLE_VENDOR_ID;
        this.paddleApiKey = process.env.PADDLE_API_KEY;
        
        // Determine environment - prioritize PADDLE_SANDBOX setting
        const forceSandbox = process.env.PADDLE_SANDBOX === 'true';
        const isProduction = process.env.NODE_ENV === 'production' && !forceSandbox;
        
        this.paddleEnvironment = isProduction ? 'production' : 'sandbox';
        this.paddleBaseUrl = this.paddleEnvironment === 'production' 
            ? 'https://vendors.paddle.com/api' 
            : 'https://sandbox-vendors.paddle.com/api';
        
        // Log environment for debugging
        console.log('🔍 PaymentService Environment:', {
            environment: this.paddleEnvironment,
            baseUrl: this.paddleBaseUrl,
            vendorId: this.paddleVendorId,
            nodeEnv: process.env.NODE_ENV,
            paddleSandbox: process.env.PADDLE_SANDBOX,
            forceSandbox: forceSandbox,
            isProduction: isProduction
        });
    }

    // Calculate credits based on amount (1000 credits per $10)
    calculateCredits(amount) {
        return Math.floor((amount / 10) * 1000);
    }

    // Calculate amount based on credits
    calculateAmount(credits) {
        return (credits / 1000) * 10;
    }

    // Create a new Paddle checkout session (SECURE - no frontend credit dependency)
    async createPaddleCheckout(userId, packageType) {
        try {
            console.log('🔒 SECURE: Creating checkout for package:', packageType);
            
            // SECURITY: Get package details from backend configuration only
            const packageDetails = this.getPackageDetails(packageType);
            if (!packageDetails) {
                throw new Error(`Invalid package type: ${packageType}`);
            }

            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Create payment record with secure package details
            const payment = new Payment({
                userId,
                paymentId,
                amount: packageDetails.amount,
                credits: packageDetails.credits,
                paymentMethod: 'paddle',
                status: 'pending',
                metadata: {
                    package: packageType,
                    secure_package_validation: true,
                    expected_amount: packageDetails.amount,
                    expected_credits: packageDetails.credits
                }
            });

            await payment.save();

            console.log('✅ SECURE: Payment record created:', {
                paymentId: payment._id,
                package: packageType,
                expectedAmount: packageDetails.amount,
                expectedCredits: packageDetails.credits
            });

            return {
                success: true,
                payment: payment,
                productId: packageDetails.priceId,
                packageDetails: packageDetails
            };

        } catch (error) {
            console.error('❌ Paddle checkout creation error:', error);
            throw new Error(`Failed to create checkout: ${error.message}`);
        }
    }

    // Get secure package details (backend only)
    getPackageDetails(packageType) {
        const packages = {
            '10k': {
                credits: 10000,
                amount: 10,
                priceId: process.env.PADDLE_PRODUCT_10K,
                name: 'Starter Package'
            },
            '50k': {
                credits: 50000,
                amount: 45,
                priceId: process.env.PADDLE_PRODUCT_50K,
                name: 'Professional Package'
            },
            '100k': {
                credits: 100000,
                amount: 85,
                priceId: process.env.PADDLE_PRODUCT_100K,
                name: 'Enterprise Package'
            }
        };

        return packages[packageType] || null;
    }

    // Get Paddle product ID based on package
    getProductId(packageType) {
        const productMap = {
            '10k': process.env.PADDLE_PRODUCT_10K,
            '50k': process.env.PADDLE_PRODUCT_50K,
            '100k': process.env.PADDLE_PRODUCT_100K
        };

        return productMap[packageType] || process.env.PADDLE_PRODUCT_10K;
    }

    // Process Paddle webhook (updated for Paddle Billing)
    async processPaddleWebhook(webhookData) {
        try {
            console.log('🔔 Received Paddle webhook:', JSON.stringify(webhookData, null, 2));
            
            // Paddle Billing uses different webhook structure
            const eventType = webhookData.event_type || webhookData.alert_name;
            
            if (!eventType) {
                console.error('No event type found in webhook data');
                return { success: false, message: 'No event type found' };
            }

            // Handle different webhook types for Paddle Billing
            switch (eventType) {
                // Paddle Billing events
                case 'transaction.completed':
                    return await this.handleTransactionCompleted(webhookData);
                case 'transaction.created':
                    return await this.handleTransactionCreated(webhookData);
                case 'transaction.payment_failed':
                    return await this.handlePaymentFailed(webhookData);
                
                // Legacy Paddle Classic events (for backward compatibility)
                case 'payment_succeeded':
                    return await this.handlePaymentSucceeded(webhookData);
                case 'payment_failed':
                    return await this.handlePaymentFailed(webhookData);
                case 'subscription_cancelled':
                    return await this.handleSubscriptionCancelled(webhookData);
                    
                default:
                    console.log(`Unhandled webhook event: ${eventType}`);
                    return { success: true, message: 'Webhook received but not processed' };
            }

        } catch (error) {
            console.error('Paddle webhook processing error:', error);
            throw error;
        }
    }

    // Handle Paddle Billing transaction completed (SECURE)
    async handleTransactionCompleted(webhookData) {
        try {
            console.log('🎉 Handling transaction completed:', webhookData);
            
            const transaction = webhookData.data;
            const transactionId = transaction.id;
            const customData = transaction.custom_data || {};
            const userId = customData.user_id;
            
            if (!userId) {
                console.error('❌ No user_id found in transaction custom_data');
                return { success: false, message: 'No user ID found' };
            }

            // SECURITY: Get amount from Paddle data only (not frontend)
            const paddleAmount = transaction.details?.totals?.total || transaction.totals?.total || 0;
            const amountInDollars = parseInt(paddleAmount) / 100; // Paddle amounts are in cents
            
            console.log('🔒 SECURE: Processing payment with Paddle amount:', {
                paddleAmountCents: paddleAmount,
                amountDollars: amountInDollars,
                transactionId: transactionId,
                userId: userId
            });

            // SECURITY: Calculate credits based on actual paid amount only
            let creditCalculation;
            try {
                creditCalculation = this.calculateCreditsFromAmount(amountInDollars);
            } catch (error) {
                console.error('❌ Invalid payment amount detected:', error.message);
                return { 
                    success: false, 
                    message: `Invalid payment amount: $${amountInDollars}`,
                    error: error.message
                };
            }

            // Find or create payment record
            let payment = await Payment.findOne({
                $or: [
                    { paymentId: transactionId },
                    { 'metadata.transaction_id': transactionId }
                ]
            });

            if (!payment) {
                payment = new Payment({
                    userId: userId,
                    paymentId: transactionId,
                    amount: creditCalculation.amount,
                    credits: creditCalculation.credits,
                    paymentMethod: 'paddle',
                    status: 'confirmed',
                    confirmedAt: new Date(),
                    metadata: {
                        transaction_id: transactionId,
                        package: creditCalculation.package,
                        paddle_billing: true,
                        paddle_amount_cents: paddleAmount,
                        verified_calculation: true,
                        webhook_data: transaction
                    }
                });
            } else {
                // Update existing payment with verified data
                payment.status = 'confirmed';
                payment.confirmedAt = new Date();
                payment.amount = creditCalculation.amount;
                payment.credits = creditCalculation.credits;
                payment.metadata = {
                    ...payment.metadata,
                    transaction_id: transactionId,
                    package: creditCalculation.package,
                    paddle_billing: true,
                    paddle_amount_cents: paddleAmount,
                    verified_calculation: true,
                    webhook_data: transaction
                };
            }

            await payment.save();
            console.log('💾 Payment record saved with verified credits:', {
                paymentId: payment._id,
                credits: payment.credits,
                amount: payment.amount,
                package: creditCalculation.package
            });

            // Add credits to user
            const user = await User.findById(userId);
            if (user) {
                const oldBalance = user.credits;
                await user.addCredits(payment.credits);
                console.log(`✅ SECURE: Added ${payment.credits} credits to user ${userId}`);
                console.log(`📊 Balance: ${oldBalance} → ${user.credits} (+${payment.credits})`);
            } else {
                console.error('❌ User not found:', userId);
                return { success: false, message: 'User not found' };
            }

            return {
                success: true,
                payment: payment,
                creditsAdded: payment.credits,
                secureCalculation: true,
                message: `Securely added ${payment.credits} credits for $${payment.amount} payment`
            };

        } catch (error) {
            console.error('❌ Error handling transaction completed:', error);
            throw error;
        }
    }

    // Handle Paddle Billing transaction created
    async handleTransactionCreated(webhookData) {
        try {
            console.log('📝 Handling transaction created:', webhookData);
            // Just log for now, main processing happens on completed
            return { success: true, message: 'Transaction created logged' };
        } catch (error) {
            console.error('Error handling transaction created:', error);
            throw error;
        }
    }

    // Calculate credits from amount (SECURE - server-side only)
    calculateCreditsFromAmount(amount) {
        console.log('🔒 Calculating credits for amount:', amount);
        
        // Exact pricing tiers - must match exactly for security
        const pricingTiers = [
            { minAmount: 84.99, maxAmount: 85.01, credits: 100000, package: '100k' },
            { minAmount: 44.99, maxAmount: 45.01, credits: 50000, package: '50k' },
            { minAmount: 9.99, maxAmount: 10.01, credits: 10000, package: '10k' }
        ];
        
        // Find exact match first
        for (const tier of pricingTiers) {
            if (amount >= tier.minAmount && amount <= tier.maxAmount) {
                console.log(`✅ Exact match found: $${amount} = ${tier.credits} credits (${tier.package})`);
                return {
                    credits: tier.credits,
                    package: tier.package,
                    amount: amount,
                    verified: true
                };
            }
        }
        
        // If no exact match, reject for security
        console.error(`❌ Invalid payment amount: $${amount} - no matching pricing tier`);
        throw new Error(`Invalid payment amount: $${amount}. Expected: $10, $45, or $85`);
    }

    // Get package details from price ID (for validation)
    getPackageFromPriceId(priceId) {
        const priceMap = {
            [process.env.PADDLE_PRODUCT_10K]: { package: '10k', credits: 10000, amount: 10 },
            [process.env.PADDLE_PRODUCT_50K]: { package: '50k', credits: 50000, amount: 45 },
            [process.env.PADDLE_PRODUCT_100K]: { package: '100k', credits: 100000, amount: 85 }
        };
        
        return priceMap[priceId] || null;
    }

    // Handle successful payment
    async handlePaymentSucceeded(data) {
        const { subscription_id, customer_id, amount, currency, order_id } = data;

        // Find payment by order ID or subscription ID
        let payment = await Payment.findOne({
            $or: [
                { paymentId: order_id },
                { 'metadata.subscription_id': subscription_id }
            ]
        });

        if (!payment) {
            throw new Error('Payment not found');
        }

        // Update payment status
        payment.status = 'confirmed';
        payment.confirmedAt = new Date();
        payment.metadata = {
            ...payment.metadata,
            subscription_id,
            customer_id,
            paddle_amount: amount,
            paddle_currency: currency
        };

        await payment.save();

        // Add credits to user
        const user = await User.findById(payment.userId);
        if (user) {
            await user.addCredits(payment.credits);
        }

        return {
            success: true,
            payment: payment
        };
    }

    // Handle failed payment
    async handlePaymentFailed(data) {
        const { subscription_id, order_id } = data;

        let payment = await Payment.findOne({
            $or: [
                { paymentId: order_id },
                { 'metadata.subscription_id': subscription_id }
            ]
        });

        if (payment) {
            payment.status = 'failed';
            await payment.save();
        }

        return {
            success: true,
            message: 'Payment failed handled'
        };
    }

    // Handle subscription cancellation
    async handleSubscriptionCancelled(data) {
        const { subscription_id } = data;

        const payment = await Payment.findOne({
            'metadata.subscription_id': subscription_id
        });

        if (payment) {
            payment.status = 'cancelled';
            await payment.save();
        }

        return {
            success: true,
            message: 'Subscription cancelled handled'
        };
    }

    // Verify Paddle webhook signature
    verifyPaddleWebhookSignature(webhookData) {
        const crypto = require('crypto');
        const { p_signature, ...data } = webhookData;

        // Sort the data alphabetically by key
        const sortedData = Object.keys(data)
            .sort()
            .reduce((result, key) => {
                result[key] = data[key];
                return result;
            }, {});

        // Create the string to verify
        const verificationString = Object.entries(sortedData)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');

        // Get the public key
        const publicKey = process.env.PADDLE_PUBLIC_KEY;

        // Verify the signature
        const verifier = crypto.createVerify('sha256');
        verifier.update(verificationString);
        const isValid = verifier.verify(publicKey, p_signature, 'base64');

        return isValid;
    }

    // Get payment status
    async getPaymentStatus(paymentId) {
        try {
            const payment = await Payment.findOne({ paymentId });
            
            if (!payment) {
                throw new Error('Payment not found');
            }

            return {
                success: true,
                payment: payment
            };
        } catch (error) {
            console.error('Payment status error:', error);
            throw new Error('Failed to get payment status');
        }
    }

    // Get available payment methods
    getAvailablePaymentMethods() {
        return [
            {
                id: 'paddle',
                name: 'Credit Card / PayPal',
                description: 'Pay with credit card or PayPal via Paddle',
                icon: 'fas fa-credit-card',
                currencies: ['usd']
            }
        ];
    }

    // Get credit packages
    getCreditPackages() {
        return [
            { credits: 10000, amount: 10, popular: false, package: '10k' },
            { credits: 50000, amount: 45, popular: true, package: '50k' },
            { credits: 100000, amount: 85, popular: false, package: '100k' }
        ];
    }

    // Test API connection
    async testApiConnection() {
        try {
            console.log('Testing Paddle API connection...');
            console.log('Using URL:', `${this.paddleBaseUrl}/2.0/product/get_products`);
            console.log('Environment:', this.paddleEnvironment);
            
            // For sandbox, we'll try a simpler endpoint first
            const testUrl = this.paddleEnvironment === 'sandbox' 
                ? `${this.paddleBaseUrl}/2.0/user/get_user` 
                : `${this.paddleBaseUrl}/2.0/product/get_products`;
            
            const response = await axios.post(testUrl, {
                vendor_id: this.paddleVendorId,
                vendor_auth_code: this.paddleApiKey
            });
            
            return { success: true, data: response.data };
        } catch (error) {
            console.error('Paddle API connection test failed:', error.response?.data || error.message);
            return { 
                success: false, 
                error: error.response?.data || error.message,
                environment: this.paddleEnvironment,
                url: `${this.paddleBaseUrl}/2.0/user/get_user`
            };
        }
    }

    // Get available currencies
    async getAvailableCurrencies() {
        return {
            success: true,
            data: {
                currencies: ['usd'],
                default: 'usd'
            }
        };
    }

    // Get saved payment methods for a user
    async getSavedPaymentMethods(userId) {
        try {
            const paymentMethods = await SavedPaymentMethod.find({
                userId: userId,
                isActive: true
            }).sort({ isDefault: -1, lastUsed: -1 });

            return {
                success: true,
                paymentMethods: paymentMethods
            };
        } catch (error) {
            console.error('Error getting saved payment methods:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Save a payment method after successful payment
    async savePaymentMethod(userId, paymentData) {
        try {
            const { customerId, paymentMethodId, type, details } = paymentData;

            // Check if this payment method already exists
            let existingMethod = await SavedPaymentMethod.findOne({
                userId: userId,
                paymentMethodId: paymentMethodId,
                isActive: true
            });

            if (existingMethod) {
                // Update last used time
                existingMethod.lastUsed = new Date();
                await existingMethod.save();
                return { success: true, paymentMethod: existingMethod };
            }

            // Check if user has any existing payment methods
            const existingMethods = await SavedPaymentMethod.find({
                userId: userId,
                isActive: true
            });

            // If this is the first payment method, make it default
            const shouldBeDefault = existingMethods.length === 0;

            // Create new saved payment method
            const savedMethod = new SavedPaymentMethod({
                userId: userId,
                customerId: customerId,
                paymentMethodId: paymentMethodId,
                type: type,
                details: details,
                isDefault: shouldBeDefault,
                lastUsed: new Date()
            });

            await savedMethod.save();

            console.log(`Payment method saved for user ${userId}, set as default: ${shouldBeDefault}`);

            return {
                success: true,
                paymentMethod: savedMethod
            };
        } catch (error) {
            console.error('Error saving payment method:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Set default payment method
    async setDefaultPaymentMethod(userId, paymentMethodId) {
        try {
            // First, remove default from all existing payment methods
            await SavedPaymentMethod.updateMany(
                { userId: userId, isActive: true },
                { isDefault: false }
            );

            // Then set the new default
            const paymentMethod = await SavedPaymentMethod.findOne({
                _id: paymentMethodId,
                userId: userId,
                isActive: true
            });

            if (!paymentMethod) {
                throw new Error('Payment method not found');
            }

            paymentMethod.isDefault = true;
            await paymentMethod.save();

            return {
                success: true,
                paymentMethod: paymentMethod
            };
        } catch (error) {
            console.error('Error setting default payment method:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update a saved payment method
    async updateSavedPaymentMethod(userId, paymentMethodId, updates) {
        try {
            const paymentMethod = await SavedPaymentMethod.findOne({
                _id: paymentMethodId,
                userId: userId,
                isActive: true
            });

            if (!paymentMethod) {
                throw new Error('Payment method not found');
            }

            // Only allow updating the isDefault property for now
            if (updates.isDefault !== undefined) {
                paymentMethod.isDefault = updates.isDefault;
            }

            await paymentMethod.save();

            return {
                success: true,
                message: 'Payment method updated successfully',
                paymentMethod: paymentMethod
            };
        } catch (error) {
            console.error('Error updating payment method:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete a saved payment method
    async deleteSavedPaymentMethod(userId, paymentMethodId) {
        try {
            const paymentMethod = await SavedPaymentMethod.findOne({
                _id: paymentMethodId,
                userId: userId
            });

            if (!paymentMethod) {
                throw new Error('Payment method not found');
            }

            const wasDefault = paymentMethod.isDefault;
            paymentMethod.isActive = false;
            await paymentMethod.save();

            // If we just deleted the default payment method, set another one as default
            if (wasDefault) {
                const remainingMethods = await SavedPaymentMethod.find({
                    userId: userId,
                    isActive: true
                }).sort({ lastUsed: -1 });

                if (remainingMethods.length > 0) {
                    // Set the most recently used method as default
                    remainingMethods[0].isDefault = true;
                    await remainingMethods[0].save();
                    console.log(`Set payment method ${remainingMethods[0]._id} as new default after deletion`);
                }
            }

            return {
                success: true,
                message: 'Payment method removed'
            };
        } catch (error) {
            console.error('Error deleting payment method:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Create checkout with saved payment method (SECURE)
    async createPaddleCheckoutWithSavedMethod(userId, packageType, savedPaymentMethodId) {
        try {
            console.log('🔒 SECURE: Creating saved payment checkout:', { userId, packageType, savedPaymentMethodId });
            
            // SECURITY: Get package details from backend configuration only
            const packageDetails = this.getPackageDetails(packageType);
            if (!packageDetails) {
                throw new Error(`Invalid package type: ${packageType}`);
            }

            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Get saved payment method
            const savedMethod = await SavedPaymentMethod.findOne({
                _id: savedPaymentMethodId,
                userId: userId,
                isActive: true
            });

            if (!savedMethod) {
                throw new Error('Saved payment method not found');
            }

            // Create payment record with secure package details
            const payment = new Payment({
                userId,
                paymentId,
                amount: packageDetails.amount,
                credits: packageDetails.credits,
                paymentMethod: 'paddle',
                status: 'pending',
                metadata: {
                    package: packageType,
                    savedPaymentMethodId: savedPaymentMethodId,
                    customerId: savedMethod.customerId,
                    secure_package_validation: true,
                    expected_amount: packageDetails.amount,
                    expected_credits: packageDetails.credits
                }
            });

            await payment.save();

            console.log('✅ SECURE: Saved payment record created:', {
                paymentId: payment._id,
                package: packageType,
                expectedAmount: packageDetails.amount,
                expectedCredits: packageDetails.credits
            });

            return {
                success: true,
                payment: payment,
                productId: packageDetails.priceId,
                savedMethod: savedMethod,
                packageDetails: packageDetails
            };

        } catch (error) {
            console.error('❌ Paddle checkout with saved method creation error:', error);
            throw new Error(`Failed to create checkout: ${error.message}`);
        }
    }
}

module.exports = new PaymentService(); 