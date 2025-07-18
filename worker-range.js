const mongoose = require('mongoose');
const emailExistence = require('email-existence');
const Email = require('./models/email');
const Upload = require('./models/upload');
const User = require('./models/user');
require('dotenv').config();

// Get range parameters from command line arguments
const startPosition = parseInt(process.argv[2]) || 0;
const endPosition = parseInt(process.argv[3]) || null;
const batchSize = parseInt(process.argv[4]) || 10;

console.log(`Worker starting with range: ${startPosition} to ${endPosition || 'end'}, batch size: ${batchSize}`);

// Database connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Worker connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

async function verifyEmailBatch() {
    try {
        // Find pending emails with range option
        let query = Email.find({ status: 'pending' }).skip(startPosition);
        
        if (endPosition !== null) {
            const limit = endPosition - startPosition;
            query = query.limit(Math.min(limit, batchSize));
        } else {
            query = query.limit(batchSize);
        }
        
        const emails = await query;
        
        if (emails.length === 0) {
            console.log(`No pending emails found in range ${startPosition} to ${endPosition || 'end'}. Exiting...`);
            process.exit(0);
        }

        console.log(`Processing batch of ${emails.length} emails (range: ${startPosition} to ${endPosition || 'end'})...`);
        
        // Group emails by upload to get user information
        const uploadIds = [...new Set(emails.map(email => email.uploadId))];
        const uploads = await Upload.find({ _id: { $in: uploadIds } }).populate('userId');
        const uploadMap = new Map(uploads.map(upload => [upload._id.toString(), upload]));
        
        // Process each email sequentially
        for (const email of emails) {
            try {
                const upload = uploadMap.get(email.uploadId.toString());
                if (!upload || !upload.userId) {
                    console.error(`No user found for email ${email.email}`);
                    email.status = 'invalid';
                    email.verificationDetails = { error: 'No user associated with upload' };
                    await email.save();
                    continue;
                }

                const user = upload.userId;
                
                // Check if user has credits (skip for admin users)
                if (!user.isAdmin() && user.credits <= 0) {
                    console.log(`User ${user.username} has no credits left. Skipping email verification.`);
                    // Mark remaining emails as invalid due to insufficient credits
                    email.status = 'invalid';
                    email.verificationDetails = { error: 'Insufficient credits' };
                    await email.save();
                    continue;
                }

                const userRole = user.isAdmin() ? 'admin' : 'customer';
                console.log(`Verifying email: ${email.email} for user: ${user.username} (Role: ${userRole}, Credits: ${user.credits})`);
                
                // Add 5-second timeout for verification
                const result = await Promise.race([
                    new Promise((resolve) => {
                        emailExistence.check(email.email, (error, exists) => {
                            resolve({ error, exists });
                        });
                    }),
                    new Promise((resolve) => 
                        setTimeout(() => resolve({ 
                            error: new Error('Verification timeout (5s)'),
                            exists: false 
                        }), 5000)
                    )
                ]);

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

                // Deduct 1 credit for each email verification (skip for admin users)
                if (!user.isAdmin()) {
                    try {
                        await user.deductCredits(1);
                        console.log(`Deducted 1 credit from user ${user.username}. Remaining credits: ${user.credits}`);
                    } catch (creditError) {
                        console.error(`Error deducting credits for user ${user.username}:`, creditError);
                        // If credit deduction fails, mark email as invalid
                        email.status = 'invalid';
                        email.verificationDetails = { error: 'Credit deduction failed' };
                    }
                } else {
                    console.log(`Admin user ${user.username} - No credits deducted`);
                }

                await email.save();
                console.log(`Updated email ${email.email} to status: ${email.status}`);
                
                // Small delay between verifications to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                console.error(`Error processing email ${email.email}:`, err);
            }
        }
        
        // If we have a specific end position and we've processed all emails in range, exit
        if (endPosition !== null && emails.length < batchSize) {
            console.log(`Completed processing range ${startPosition} to ${endPosition}. Exiting...`);
            process.exit(0);
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
console.log(`Starting email verification worker with range: ${startPosition} to ${endPosition || 'end'}, batch size: ${batchSize}...`);
verifyPendingEmails();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Stopping email verification worker...');
    await mongoose.disconnect();
    process.exit(0);
}); 