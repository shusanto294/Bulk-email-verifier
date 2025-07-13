# Paddle Payment Integration Setup Guide

## Required Environment Variables

Add these environment variables to your `.env` file:

```env
# Paddle Account Settings
PADDLE_VENDOR_ID=your_vendor_id
PADDLE_API_KEY=your_api_key
PADDLE_PUBLIC_KEY=your_public_key

# Product IDs for Different Packages
PADDLE_PRODUCT_10K=your_10k_product_id
PADDLE_PRODUCT_50K=your_50k_product_id
PADDLE_PRODUCT_100K=your_100k_product_id

# Environment
NODE_ENV=development # or production
```

## Setup Steps

1. Create a Paddle account at https://paddle.com

2. Get your Vendor ID:
   - Log in to your Paddle Dashboard
   - Go to Developer Tools > Authentication
   - Copy your Vendor ID

3. Get your API Key:
   - In the Paddle Dashboard, go to Developer Tools > Authentication
   - Generate or copy your API Key

4. Get your Public Key:
   - In the Paddle Dashboard, go to Developer Tools > Public Key
   - Copy your Public Key

5. Create Products:
   - Go to Catalog > Products
   - Create three products for different credit packages:
     * 10K Credits Package
     * 50K Credits Package
     * 100K Credits Package
   - Copy the Product IDs for each package

6. Configure Webhook:
   - Go to Developer Tools > Webhooks
   - Add webhook URL: `https://your-domain.com/payments/webhook`
   - Enable the following alerts:
     * Payment Succeeded
     * Payment Failed
     * Subscription Cancelled

## Testing

1. Use Paddle Sandbox for testing:
   - Set `NODE_ENV=development` to use sandbox mode
   - Use Paddle's test card numbers for payments
   - Test card: 4242 4242 4242 4242, any future expiry date, any CVC

2. Test Webhook:
   - Use a tool like ngrok for local webhook testing
   - Update webhook URL in Paddle dashboard with ngrok URL
   - Make test purchases to verify webhook handling

## Troubleshooting

1. Check browser console for JavaScript errors
2. Verify environment variables are properly set
3. Ensure Paddle.js is loading correctly
4. Verify product IDs match those in Paddle dashboard
5. Check server logs for webhook processing errors

## Support

For issues with Paddle integration:
- Paddle Support: https://paddle.com/support/
- Paddle API Documentation: https://developer.paddle.com/ 