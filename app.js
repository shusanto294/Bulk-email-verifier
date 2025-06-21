require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const uploadRoutes = require('./routes/upload');

const app = express();

// MongoDB connection
mongoose.connect('mongodb+srv://shusanto:apple727354@cluster0.uokbi.mongodb.net/email_verifier?retryWrites=true&w=majority')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/upload', uploadRoutes);
app.use('/api', require('./routes/api'));

// Home route
app.get('/', (req, res) => {
    res.redirect('/upload');
});

// Find available port starting from 3000
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        mongoose.connection.close(false, () => {
            console.log('Server and DB connections closed');
            process.exit(0);
        });
    });
});

// Handle port in use errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is in use, trying ${PORT + 1}`);
        app.listen(PORT + 1);
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});