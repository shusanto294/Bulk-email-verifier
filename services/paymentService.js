const axios = require('axios');
const Payment = require('../models/payment');
const User = require('../models/user');

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

    // Create a new Paddle checkout session
    async createPaddleCheckout(userId, credits, packageType) {
        try {
            const amount = this.calculateAmount(credits);
            const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Create payment record
            const payment = new Payment({
                userId,
                paymentId,
                amount,
                credits,
                paymentMethod: 'paddle',
                status: 'pending',
                metadata: {
                    package: packageType
                }
            });

            await payment.save();

            // Get product ID based on package
            const productId = this.getProductId(packageType);

            return {
                success: true,
                payment: payment,
                productId: productId
            };

        } catch (error) {
            console.error('Paddle checkout creation error:', error);
            throw new Error(`Failed to create checkout: ${error.message}`);
        }
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

    // Process Paddle webhook
    async processPaddleWebhook(webhookData) {
        try {
            const { alert_name, p_signature, ...data } = webhookData;

            // Verify webhook signature
            if (!this.verifyPaddleWebhookSignature(webhookData)) {
                throw new Error('Invalid webhook signature');
            }

            // Handle different webhook types
            switch (alert_name) {
                case 'payment_succeeded':
                    return await this.handlePaymentSucceeded(data);
                case 'payment_failed':
                    return await this.handlePaymentFailed(data);
                case 'subscription_cancelled':
                    return await this.handleSubscriptionCancelled(data);
                default:
                    console.log(`Unhandled webhook: ${alert_name}`);
                    return { success: true, message: 'Webhook received' };
            }

        } catch (error) {
            console.error('Paddle webhook processing error:', error);
            throw error;
        }
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
}

module.exports = new PaymentService(); 