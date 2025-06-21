const mongoose = require('mongoose');
const emailExistence = require('email-existence');
const Email = require('./models/email');
require('dotenv').config();

// Database connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Worker connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

async function verifyEmailBatch() {
    try {
        // Find up to 100 pending emails at a time
        const emails = await Email.find({ status: 'pending' }).limit(100);
        
        if (emails.length === 0) {
            console.log('No pending emails found. Waiting for new emails...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return;
        }

        console.log(`Processing batch of ${emails.length} emails...`);
        
        // Process each email sequentially
        for (const email of emails) {
            try {
                console.log(`Verifying email: ${email.email}`);
                
                const result = await new Promise((resolve) => {
                    emailExistence.check(email.email, (error, exists) => {
                        resolve({ error, exists });
                    });
                });

                if (result.error) {
                    console.error(`Error verifying ${email.email}:`, result.error);
                    email.status = 'invalid';
                    email.verificationDetails = { error: result.error.message };
                } else {
                    email.status = result.exists ? 'verified' : 'invalid';
                    email.verificationDetails = { exists: result.exists };
                    email.verifiedAt = new Date();
                    console.log(`Email ${email.email} is ${result.exists ? 'valid' : 'invalid'}`);
                }

                await email.save();
            } catch (err) {
                console.error(`Error processing email ${email.email}:`, err);
            }
        }
    } catch (err) {
        console.error('Error in batch processing:', err);
    }
}

async function verifyPendingEmails() {
    while (true) {
        await verifyEmailBatch();
    }
}

// Start the verification process
console.log('Starting continuous email verification worker...');
verifyPendingEmails();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Stopping email verification worker...');
    await mongoose.disconnect();
    process.exit(0);
});
