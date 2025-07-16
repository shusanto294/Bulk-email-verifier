require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const createAdminUser = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ 
            $or: [
                { email: 'verify@bdwebguy.com' },
                { username: 'admin' }
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
            username: 'admin',
            email: 'verify@bdwebguy.com',
            password: 'admin123456', // Change this to a secure password
            credits: 999999999, // Unlimited credits
            isActive: true,
            isEmailVerified: true,
            lastLogin: new Date(),
            role: 'admin'
        });

        await adminUser.save();
        console.log('Admin user created successfully!');
        console.log('Username: admin');
        console.log('Email: verify@bdwebguy.com');
        console.log('Password: admin123456');
        console.log('Credits: 999999999 (unlimited)');
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