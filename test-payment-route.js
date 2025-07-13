require('dotenv').config();
const paymentService = require('./services/paymentService');

async function testPaymentRoute() {
    console.log('Testing Payment Route...\n');

    // Test 1: Check if payment service methods work
    console.log('1. Testing Payment Service Methods:');
    try {
        const methods = paymentService.getAvailablePaymentMethods();
        console.log('   ✅ Payment methods:', methods.length);
        
        const packages = paymentService.getCreditPackages();
        console.log('   ✅ Credit packages:', packages.length);
        
        console.log('   Available packages:');
        packages.forEach(pkg => {
            console.log(`   - ${pkg.credits.toLocaleString()} credits: $${pkg.amount} (${pkg.package})`);
        });
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }

    // Test 2: Check environment variables
    console.log('\n2. Environment Variables:');
    console.log(`   PADDLE_VENDOR_ID: ${process.env.PADDLE_VENDOR_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_API_KEY: ${process.env.PADDLE_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PUBLIC_KEY: ${process.env.PADDLE_PUBLIC_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_10K: ${process.env.PADDLE_PRODUCT_10K ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_50K: ${process.env.PADDLE_PRODUCT_50K ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PADDLE_PRODUCT_100K: ${process.env.PADDLE_PRODUCT_100K ? '✅ Set' : '❌ Missing'}`);

    // Test 3: Test product ID mapping
    console.log('\n3. Product ID Mapping:');
    try {
        const product10k = paymentService.getProductId('10k');
        const product50k = paymentService.getProductId('50k');
        const product100k = paymentService.getProductId('100k');
        
        console.log(`   10K Product ID: ${product10k || '❌ Not set'}`);
        console.log(`   50K Product ID: ${product50k || '❌ Not set'}`);
        console.log(`   100K Product ID: ${product100k || '❌ Not set'}`);
    } catch (error) {
        console.log('   ❌ Error getting product IDs:', error.message);
    }

    // Test 4: Test API connection (if credentials are set)
    if (process.env.PADDLE_API_KEY) {
        console.log('\n4. Paddle API Connection:');
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
        console.log('\n4. Paddle API Connection:');
        console.log('   ⚠️  Skipped - PADDLE_API_KEY not set');
    }

    console.log('\nNext Steps:');
    console.log('1. If environment variables are missing, add them to your .env file');
    console.log('2. If API connection fails, check your Paddle credentials');
    console.log('3. Make sure you are logged in when testing the Buy Now buttons');
    console.log('4. Check browser console for any JavaScript errors');
}

// Run the test
testPaymentRoute().catch(console.error); 