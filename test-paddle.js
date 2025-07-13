require('dotenv').config();
const paymentService = require('./services/paymentService');

async function testPaddleConfiguration() {
    console.log('Testing Paddle Configuration...\n');

    // Test 1: Check environment variables
    console.log('1. Environment Variables:');
    console.log(`   PADDLE_VENDOR_ID: ${process.env.PADDLE_VENDOR_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_API_KEY: ${process.env.PADDLE_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PUBLIC_KEY: ${process.env.PADDLE_PUBLIC_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_10K: ${process.env.PADDLE_PRODUCT_10K ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_50K: ${process.env.PADDLE_PRODUCT_50K ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_100K: ${process.env.PADDLE_PRODUCT_100K ? '✅ Set' : '❌ Missing'}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}\n`);

    // Test 2: Check payment service methods
    console.log('2. Payment Service Methods:');
    try {
        const methods = paymentService.getAvailablePaymentMethods();
        console.log(`   Available payment methods: ${methods.length}`);
        methods.forEach(method => {
            console.log(`   - ${method.name}: ${method.description}`);
        });
        console.log('   ✅ Payment methods loaded successfully\n');
    } catch (error) {
        console.log(`   ❌ Error loading payment methods: ${error.message}\n`);
    }

    // Test 3: Check credit packages
    console.log('3. Credit Packages:');
    try {
        const packages = paymentService.getCreditPackages();
        console.log(`   Available packages: ${packages.length}`);
        packages.forEach(pkg => {
            console.log(`   - ${pkg.credits.toLocaleString()} credits: $${pkg.amount} (${pkg.package})`);
        });
        console.log('   ✅ Credit packages loaded successfully\n');
    } catch (error) {
        console.log(`   ❌ Error loading credit packages: ${error.message}\n`);
    }

    // Test 4: Check API connection (if credentials are set)
    if (process.env.PADDLE_API_KEY) {
        console.log('4. Paddle API Connection:');
        try {
            const connectionTest = await paymentService.testApiConnection();
            if (connectionTest.success) {
                console.log('   ✅ Paddle API connection successful');
            } else {
                console.log(`   ❌ Paddle API connection failed: ${connectionTest.error}`);
            }
        } catch (error) {
            console.log(`   ❌ Paddle API connection error: ${error.message}`);
        }
    } else {
        console.log('4. Paddle API Connection:');
        console.log('   ⚠️  Skipped - PADDLE_API_KEY not set');
    }

    console.log('\nSetup Instructions:');
    console.log('1. Add Paddle environment variables to your .env file');
    console.log('2. Create products in your Paddle dashboard');
    console.log('3. Configure webhooks in Paddle dashboard');
    console.log('4. Test the payment flow');
    console.log('\nSee PADDLE_SETUP.md for detailed instructions.');
}

// Run the test
testPaddleConfiguration().catch(console.error); 