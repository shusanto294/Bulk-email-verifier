const mongoose = require('mongoose');
const { validate } = require('deep-email-validator');
const Email = require('../models/email');
const Upload = require('../models/upload');
const User = require('../models/user');
require('dotenv').config();

// Database connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Worker 3 connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

async function verifyEmailBatch() {
    try {
        // Find up to 100 pending emails at a time with offset for worker 3
        const emails = await Email.find({ status: 'pending' }).skip(200).limit(100);
        
        if (emails.length === 0) {
            console.log('Worker 3: No pending emails found. Waiting for new emails...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
        }

        console.log(`Worker 3: Processing batch of ${emails.length} emails...`);
        
        // Group emails by upload to get user information
        const uploadIds = [...new Set(emails.map(email => email.uploadId))];
        const uploads = await Upload.find({ _id: { $in: uploadIds } }).populate('userId');
        const uploadMap = new Map(uploads.map(upload => [upload._id.toString(), upload]));
        
        // Process each email sequentially
        for (const email of emails) {
            try {
                const upload = uploadMap.get(email.uploadId.toString());
                if (!upload || !upload.userId) {
                    console.error(`Worker 3: No user found for email ${email.email}`);
                    email.status = 'invalid';
                    email.verificationDetails = { error: 'No user associated with upload' };
                    await email.save();
                    continue;
                }

                const user = upload.userId;
                
                // Check if user has credits (skip for admin users)
                if (!user.isAdmin() && user.credits <= 0) {
                    console.log(`Worker 3: User ${user.username} has no credits left. Skipping email verification.`);
                    // Mark remaining emails as invalid due to insufficient credits
                    email.status = 'invalid';
                    email.verificationDetails = { error: 'Insufficient credits' };
                    await email.save();
                    continue;
                }

                const userRole = user.isAdmin() ? 'admin' : 'customer';
                console.log(`Worker 3: Verifying email: ${email.email} for user: ${user.username} (Role: ${userRole}, Credits: ${user.credits})`);
                
                // Use deep-email-validator with 10-second timeout
                const result = await Promise.race([
                    validate({
                        email: email.email,
                        sender: process.env.SENDER_EMAIL || 'name@example.org'
                    }),
                    new Promise((resolve) => 
                        setTimeout(() => resolve({ 
                            valid: false,
                            reason: 'timeout',
                            validators: {}
                        }), 10000)
                    )
                ]);

                // Log full response data from verifier package
                console.log(`Worker 3: Full verifier response for ${email.email}:`, JSON.stringify(result, null, 2));

                if (result.reason === 'timeout') {
                    console.error(`Worker 3: Timeout verifying ${email.email}`);
                    email.status = 'invalid';
                    email.verificationDetails = { 
                        error: 'Verification timeout (10s)',
                        timeout: true
                    };
                } else {
                    email.status = result.valid ? 'verified' : 'invalid';
                    
                    // Store comprehensive validation data in both old and new format
                    email.verificationDetails = {
                        valid: result.valid,
                        reason: result.reason,
                        disposable: result.validators?.disposable?.valid === false,
                        typo: result.validators?.typo?.valid === false,
                        mx: result.validators?.mx || {},
                        smtp: result.validators?.smtp || {},
                        regex: result.validators?.regex || {},
                        catchAll: result.validators?.mx?.valid && result.validators?.smtp?.valid === false,
                        rawResult: result
                    };
                    
                    // Store in new schema fields for easier querying
                    email.isDisposable = result.validators?.disposable?.valid === false;
                    email.hasTypo = result.validators?.typo?.valid === false;
                    email.mxValid = result.validators?.mx?.valid || false;
                    email.smtpValid = result.validators?.smtp?.valid || false;
                    email.regexValid = result.validators?.regex?.valid || false;
                    email.isCatchAll = result.validators?.mx?.valid && result.validators?.smtp?.valid === false;
                    email.validationReason = result.reason;
                    
                    email.verifiedAt = new Date();
                    console.log(`Worker 3: Email ${email.email} is ${result.valid ? 'valid' : 'invalid'} - Reason: ${result.reason || 'N/A'}`);
                }

                // Deduct 1 credit for each email verification (skip for admin users)
                if (!user.isAdmin()) {
                    try {
                        await user.deductCredits(1);
                        console.log(`Worker 3: Deducted 1 credit from user ${user.username}. Remaining credits: ${user.credits}`);
                    } catch (creditError) {
                        console.error(`Worker 3: Error deducting credits for user ${user.username}:`, creditError);
                        // If credit deduction fails, mark email as invalid
                        email.status = 'invalid';
                        email.verificationDetails = { error: 'Credit deduction failed' };
                    }
                } else {
                    console.log(`Worker 3: Admin user ${user.username} - No credits deducted`);
                }

                await email.save();
                console.log(`Worker 3: Updated email ${email.email} to status: ${email.status}`);
                
                // Small delay between verifications to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 120));
            } catch (err) {
                console.error(`Worker 3: Error processing email ${email.email}:`, err);
            }
        }
    } catch (err) {
        console.error('Worker 3: Error in batch processing:', err);
    }
}

async function verifyPendingEmails() {
    while (true) {
        await verifyEmailBatch();
    }
}

// Start the verification process
console.log('Starting Worker 3: continuous email verification worker with credit management...');
verifyPendingEmails();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Stopping Worker 3: email verification worker...');
    await mongoose.disconnect();
    process.exit(0);
});