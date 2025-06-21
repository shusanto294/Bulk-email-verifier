# Bulk Email Verifier

A Node.js application for uploading CSV files containing emails and verifying their validity.

## Features

- Upload CSV files containing email addresses
- Store upload records in MongoDB
- Track verification status of each email
- View statistics and verification results

## Installation

1. Clone this repository
2. Install dependencies:
```shell
npm install
```

3. Create a `.env` file in the root directory with your MongoDB connection string:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
```

## Usage

1. Start the application:
```shell
npm start
```

2. Open your browser to `http://localhost:3000`

3. Upload a CSV file with an `email` column containing email addresses

4. View upload history and verification statistics

## File Structure

- `app.js` - Main application file
- `routes/upload.js` - File upload routes
- `models/` - MongoDB models
  - `email.js` - Email verification model
  - `upload.js` - File upload model
- `views/` - EJS templates
  - `upload.ejs` - Upload interface
  - `upload-details.ejs` - Verification results

## Dependencies

- Express - Web framework
- Mongoose - MongoDB ODM
- Multer - File upload handling
- CSV-parser - CSV file processing
- EJS - Templating engine
- Dotenv - Environment variables