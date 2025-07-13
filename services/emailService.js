const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // Create transporter with custom SMTP configuration
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.your-provider.com',
            port: process.env.EMAIL_PORT || 587,
            secure: process.env.EMAIL_SECURE === 'true' || false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER || 'your-email@your-domain.com',
                pass: process.env.EMAIL_PASS || 'your-smtp-password'
            },
            tls: {
                rejectUnauthorized: false // Only use this in development
            }
        });
    }

    async sendContactNotification(contactData) {
        try {
            const {
                name,
                email,
                phone,
                package: packageType,
                message,
                price,
                credits
            } = contactData;

            const packageNames = {
                '10k': 'Starter (10,000 Credits)',
                '50k': 'Professional (50,000 Credits)',
                '100k': 'Enterprise (100,000 Credits)'
            };

            const mailOptions = {
                from: process.env.EMAIL_USER || 'your-email@your-domain.com',
                to: 'shusanto@bdwebguy.com',
                subject: `New Credit Purchase Request - ${packageNames[packageType]}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h2>New Credit Purchase Request</h2>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h3 style="color: #667eea; margin-top: 0;">Customer Information</h3>
                                <p><strong>Name:</strong> ${name}</p>
                                <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                                <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
                            </div>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h3 style="color: #667eea; margin-top: 0;">Package Details</h3>
                                <p><strong>Package:</strong> ${packageNames[packageType]}</p>
                                <p><strong>Credits:</strong> ${credits.toLocaleString()}</p>
                                <p><strong>Price:</strong> $${price}</p>
                            </div>
                            
                            ${message ? `
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h3 style="color: #667eea; margin-top: 0;">Additional Message</h3>
                                <p style="white-space: pre-wrap;">${message}</p>
                            </div>
                            ` : ''}
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="mailto:${email}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
                                    Reply to Customer
                                </a>
                                <a href="tel:${phone}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                    Call Customer
                                </a>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
                            <p>This email was sent from your Bulk Email Verifier application</p>
                        </div>
                    </div>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Email sending error:', error);
            throw new Error('Failed to send email notification');
        }
    }

    async sendWelcomeEmail(userEmail, username) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER || 'your-email@your-domain.com',
                to: userEmail,
                subject: 'Welcome to Bulk Email Verifier!',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h2>Welcome to Bulk Email Verifier!</h2>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                            <p>Hello ${username},</p>
                            
                            <p>Welcome to Bulk Email Verifier! We're excited to have you on board.</p>
                            
                            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h3 style="color: #667eea; margin-top: 0;">Your Account Benefits</h3>
                                <ul>
                                    <li>100 free credits to start</li>
                                    <li>Bulk email verification</li>
                                    <li>Detailed verification reports</li>
                                    <li>CSV export functionality</li>
                                </ul>
                            </div>
                            
                            <p>Start by uploading your first CSV file to verify email addresses.</p>
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${process.env.APP_URL || 'http://localhost:3000'}/upload" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                    Upload Your First File
                                </a>
                            </div>
                        </div>
                    </div>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Welcome email error:', error);
            throw new Error('Failed to send welcome email');
        }
    }

    // Test email connection
    async testConnection() {
        try {
            await this.transporter.verify();
            return { success: true, message: 'SMTP connection successful' };
        } catch (error) {
            console.error('SMTP connection test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService(); 