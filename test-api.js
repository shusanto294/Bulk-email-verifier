const axios = require('axios');

const API_KEY = 'B2JK21W-FF74JPS-H0MZB2T-PEMR6TS';
const BASE_URL = 'https://api.nowpayments.io/v1';

async function testAPI() {
    console.log('Testing NOWPayments API...\n');
    
    try {
        // Test 1: Check API status
        console.log('1. Testing API status...');
        const statusResponse = await axios.get(`${BASE_URL}/status`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ API Status:', statusResponse.data);
        
        // Test 2: Get available currencies
        console.log('\n2. Getting available currencies...');
        const currenciesResponse = await axios.get(`${BASE_URL}/currencies`, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('✅ Available currencies:', currenciesResponse.data);
        
        // Test 3: Try to get USDT estimate
        console.log('\n3. Testing USDT estimate...');
        const estimateResponse = await axios.get(`${BASE_URL}/estimate`, {
            headers: { 'x-api-key': API_KEY },
            params: {
                amount: 25,
                currency_from: 'usd',
                currency_to: 'usdt'
            }
        });
        console.log('✅ USDT Estimate:', estimateResponse.data);
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
    }
}

testAPI(); 