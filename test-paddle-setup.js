require('dotenv').config();
const paymentService = require('./services/paymentService');

async function testPaddleSetup() {
    console.log('🔧 Testing Paddle Setup...\n');

    // Test 1: Environment Variables
    console.log('1. Environment Variables Check:');
    console.log('   NODE_ENV:', process.env.NODE_ENV);
    console.log('   PADDLE_VENDOR_ID:', process.env.PADDLE_VENDOR_ID ? '✅ Configured' : '❌ Not configured');
    console.log('   PADDLE_API_KEY:', process.env.PADDLE_API_KEY ? '✅ Configured' : '❌ Not configured');
    console.log('   PADDLE_PUBLIC_KEY:', process.env.PADDLE_PUBLIC_KEY ? '✅ Configured' : '❌ Not configured');
    console.log('   PADDLE_PRODUCTS:', process.env.PADDLE_PRODUCTS ? '✅ Configured' : '❌ Not configured');
    console.log('');

    // Test 2: Payment Service Environment Info
    console.log('2. Payment Service Environment Info:');
    const envInfo = paymentService.getEnvironmentInfo();
    console.log('   Environment:', envInfo.environment);
    console.log('   Vendor ID:', envInfo.vendorId);
    console.log('   API Key:', envInfo.apiKey);
    console.log('   Public Key:', envInfo.publicKey);
    console.log('   Products:', envInfo.products);
    console.log('');

    // Test 3: Product IDs
    console.log('3. Product ID Mapping:');
    const packages = ['10k', '50k', '100k'];
    packages.forEach(pkg => {
        const productId = paymentService.getProductId(pkg);
        console.log(`   ${pkg}: ${productId || '❌ Not configured'}`);
    });
    console.log('');

    // Test 4: API Connection (if credentials are configured)
    if (process.env.PADDLE_API_KEY) {
        console.log('4. Testing Paddle API Connection:');
        try {
            const apiTest = await paymentService.testApiConnection();
            if (apiTest.success) {
                console.log('   ✅ API connection successful');
                console.log('   Environment:', apiTest.environment);
            } else {
                console.log('   ❌ API connection failed:', apiTest.error);
            }
        } catch (error) {
            console.log('   ❌ API test error:', error.message);
        }
        console.log('');
    } else {
        console.log('4. Skipping API test (no API key configured)');
        console.log('');
    }

    // Test 5: Credit Packages
    console.log('5. Credit Packages:');
    const creditPackages = paymentService.getCreditPackages();
    creditPackages.forEach(pkg => {
        console.log(`   ${pkg.package}: ${pkg.credits.toLocaleString()} credits for $${pkg.amount}`);
    });
    console.log('');

    // Test 6: Payment Methods
    console.log('6. Available Payment Methods:');
    const paymentMethods = paymentService.getAvailablePaymentMethods();
    paymentMethods.forEach(method => {
        console.log(`   ${method.name}: ${method.description}`);
    });
    console.log('');

    // Summary
    console.log('📋 Setup Summary:');
    const hasVendorId = !!process.env.PADDLE_VENDOR_ID;
    const hasApiKey = !!process.env.PADDLE_API_KEY;
    const hasProducts = !!process.env.PADDLE_PRODUCTS;
    
    if (hasVendorId && hasApiKey && hasProducts) {
        console.log('   ✅ All required Paddle credentials are configured');
        console.log('   🎯 Ready for sandbox testing');
    } else {
        console.log('   ⚠️  Some Paddle credentials are missing:');
        if (!hasVendorId) console.log('      - PADDLE_VENDOR_ID');
        if (!hasApiKey) console.log('      - PADDLE_API_KEY');
        if (!hasProducts) console.log('      - PADDLE_PRODUCTS');
        console.log('   📝 Please configure missing credentials in your .env file');
    }

    console.log('\n🚀 Next Steps:');
    console.log('   1. Copy env.example to .env');
    console.log('   2. Update .env with your Paddle sandbox credentials');
    console.log('   3. Start the server: npm start');
    console.log('   4. Visit /payments/buy-credits to test payments');
    console.log('   5. Use test card: 4242 4242 4242 4242');
}

// Run the test
testPaddleSetup().catch(console.error); 