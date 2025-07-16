# Bulk Email Verifier

A comprehensive bulk email verification system with user authentication, credit system, and payment integration.

## Features

- **Bulk Email Verification**: Upload CSV files and verify email addresses in bulk
- **User Authentication**: Secure registration and login system
- **Credit System**: Pay-per-verification model with credit management
- **Payment Integration**: NOWPayments integration for crypto and card payments
- **Real-time Processing**: Background worker for email verification
- **Dashboard**: User-friendly dashboard with statistics and upload history
- **Payment History**: Track all payment transactions

## Payment System

### Credit Packages
- 1,000 Credits - $10 USD
- 2,500 Credits - $25 USD (Most Popular)
- 5,000 Credits - $50 USD
- 10,000 Credits - $100 USD
- 25,000 Credits - $250 USD
- 50,000 Credits - $500 USD

### Payment Methods
- **Cryptocurrency**: USDT, BTC, ETH, LTC, BCH, XRP
- **Credit/Debit Cards**: Visa, Mastercard, and other major cards

### How It Works
1. Users select a credit package using the interactive slider
2. Choose payment method (crypto or card)
3. Complete payment through NOWPayments
4. Credits are automatically added to account upon successful payment
5. Each email verification costs 1 credit

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bulk-email-verifier
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/bulk-email-verifier

# Session Secret
SESSION_SECRET=your-super-secret-session-key-change-this

# NOWPayments Configuration
NOWPAYMENTS_API_KEY=your-nowpayments-api-key
NOWPAYMENTS_WEBHOOK_SECRET=your-nowpayments-webhook-secret

# Application Configuration
BASE_URL=http://localhost:3001
NODE_ENV=development
```

4. Start MongoDB (make sure MongoDB is installed and running)

5. Run the application:
```bash
npm start
```

## NOWPayments Setup

1. Sign up for a NOWPayments account at https://nowpayments.io
2. Get your API key from the dashboard
3. Set up webhook URL: `https://bulk-email-verifier.bdwebguy.com/payments/webhook`
4. Configure webhook secret in your NOWPayments dashboard
5. Add the API key and webhook secret to your `.env` file

## Usage

1. **Registration/Login**: Create an account or log in
2. **Buy Credits**: Navigate to "Buy Credits" to purchase verification credits
3. **Upload CSV**: Upload a CSV file with email addresses
4. **Monitor Progress**: Track verification progress in real-time
5. **Download Results**: Download verified results when complete

## File Structure

```
bulk-email-verifier/
├── app.js                 # Main application file
├── worker.js             # Background email verification worker
├── models/
│   ├── user.js           # User model with authentication
│   ├── email.js          # Email verification model
│   ├── upload.js         # File upload model
│   └── payment.js        # Payment transaction model
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── upload.js         # File upload routes
│   ├── api.js            # API endpoints
│   ├── dashboard.js      # Dashboard routes
│   └── payments.js       # Payment routes
├── middleware/
│   └── auth.js           # Authentication middleware
├── services/
│   └── paymentService.js # NOWPayments integration service
├── views/
│   ├── login.ejs         # Login page
│   ├── register.ejs      # Registration page
│   ├── dashboard.ejs     # Dashboard page
│   ├── upload.ejs        # File upload page
│   ├── upload-details.ejs # Upload progress page
│   └── payments/
│       ├── buy-credits.ejs # Credit purchase page
│       └── history.ejs     # Payment history page
└── uploads/              # Temporary file storage
```

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/logout` - User logout

### Dashboard
- `GET /dashboard` - User dashboard

### File Upload
- `GET /upload` - Upload page
- `POST /upload` - Upload CSV file
- `GET /upload/:id` - Upload details and progress

### Payments
- `GET /payments/buy-credits` - Credit purchase page
- `POST /payments/create-payment` - Create payment
- `GET /payments/status/:id` - Check payment status
- `GET /payments/history` - Payment history
- `POST /payments/webhook` - NOWPayments webhook

### API
- `GET /api/uploads` - Get user uploads
- `GET /api/uploads/:id` - Get upload details
- `GET /api/uploads/:id/status` - Get upload status

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- CSRF protection
- Input validation and sanitization
- Secure file upload handling
- Payment signature verification

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: bcryptjs, express-session
- **File Processing**: multer, csv-parser
- **Email Verification**: email-existence
- **Payments**: NOWPayments API
- **Frontend**: EJS templates, Bootstrap 5, Font Awesome
- **Background Processing**: Node.js worker threads

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.