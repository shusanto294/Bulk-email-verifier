require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

// Admin user configuration from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bulk-email-verifier.bdwebguy.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';
const ADMIN_CREDITS = process.env.ADMIN_CREDITS || 999999999;

const createAdminUser = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ 
            $or: [
                { email: ADMIN_EMAIL },
                { username: ADMIN_USERNAME }
            ]
        });

        if (existingAdmin) {
            console.log('Admin user already exists');
            console.log('Username:', existingAdmin.username);
            console.log('Email:', existingAdmin.email);
            console.log('Credits:', existingAdmin.credits);
            return;
        }

        // Create admin user with unlimited credits
        const adminUser = new User({
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            credits: ADMIN_CREDITS, // Unlimited credits
            isActive: true,
            isEmailVerified: true,
            lastLogin: new Date(),
            role: 'admin'
        });

        await adminUser.save();
        console.log('Admin user created successfully!');
        console.log('Username:', ADMIN_USERNAME);
        console.log('Email:', ADMIN_EMAIL);
        console.log('Password:', ADMIN_PASSWORD);
        console.log('Credits:', ADMIN_CREDITS, '(unlimited)');
        console.log('');
        console.log('IMPORTANT: Please change the default password after first login!');

    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
    }
};

// Run the seeder
createAdminUser();