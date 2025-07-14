const nodemailer = require('nodemailer');
const User = require('../models/user');

class EmailVerificationService {
    constructor() {
        // Initialize email transporter with custom SMTP settings
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                // Do not fail on invalid certs for custom SMTP
                rejectUnauthorized: false
            }
        });

        // Test SMTP connection on startup
        this.testConnection();

        // Common temporary/disposable email domains
        this.temporaryEmailDomains = new Set([
            // Popular temporary email services
            '10minutemail.com', '10minutemail.net', '2prong.com', '3d-painting.com',
            'advantures.com', 'agedmail.com', 'ama-trade.de', 'anappthat.com',
            'ano-mail.net', 'anon-mail.de', 'anonymbox.com', 'antichef.com',
            'antireg.ru', 'armyspy.com', 'baxomale.ht.cx', 'binkmail.com',
            'bio-muesli.net', 'bobmail.info', 'breakthru.com', 'brefmail.com',
            'broadbandninja.com', 'bspamfree.org', 'buffemail.com', 'bugmenot.com',
            'casualdx.com', 'chammy.info', 'childsavetrust.org', 'chogmail.com',
            'choicemail1.com', 'cool.fr.nf', 'correo.blogos.net', 'cosmorph.com',
            'courriel.fr.nf', 'courrieltemporaire.com', 'cubiclink.com', 'curryworld.de',
            'cust.in', 'dacoolest.com', 'dandikmail.com', 'dayrep.com',
            'deadaddress.com', 'deadspam.com', 'digitalsanctuary.com', 'discardmail.com',
            'discardmail.de', 'disposableaddress.com', 'disposableinbox.com', 'dispose.it',
            'dispostable.com', 'dm.gg', 'dodgeit.com', 'dodgit.com',
            'dontreg.com', 'dontsendmespam.de', 'drdrb.com', 'dump-email.info',
            'dumpandjunk.com', 'dumpmail.de', 'dumpyemail.com', 'e4ward.com',
            'email60.com', 'emailias.com', 'emailinfive.com', 'emailmiser.com',
            'emails.ga', 'emailsensei.com', 'emailtemporanea.com', 'emailto.de',
            'emailwarden.com', 'emailx.at.hm', 'emailxfer.com', 'emeil.in',
            'emeil.ir', 'emz.net', 'evopo.com', 'explodemail.com',
            'fakeinbox.com', 'fakemailz.com', 'fakemail.fr', 'fastacura.com',
            'fastchevy.com', 'fastchrysler.com', 'fastkawasaki.com', 'fastmazda.com',
            'fastmitsubishi.com', 'fastnissan.com', 'fastsubaru.com', 'fastsuzuki.com',
            'fasttoyota.com', 'fastyamaha.com', 'filzmail.com', 'fivemail.de',
            'fleckens.hu', 'floppy.it', 'fr33mail.info', 'frapmail.com',
            'garliclife.com', 'get2mail.fr', 'getairmail.com', 'getmails.eu',
            'getonemail.com', 'getonemail.net', 'ghosttexter.de', 'girlsundertheinfluence.com',
            'gishpuppy.com', 'great-host.in', 'greensloth.com', 'grr.la',
            'gsrv.co.uk', 'guerillamail.biz', 'guerillamail.com', 'guerillamail.de',
            'guerillamail.net', 'guerillamail.org', 'guerrillamail.biz', 'guerrillamail.com',
            'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
            'gustr.com', 'harakirimail.com', 'hartbot.de', 'hidemail.de',
            'hidzz.com', 'hmamail.com', 'hopemail.biz', 'ichimail.ru',
            'imails.info', 'inboxalias.com', 'inboxclean.com', 'inboxclean.org',
            'incognitomail.com', 'incognitomail.net', 'incognitomail.org', 'insorg-mail.info',
            'instant-mail.de', 'ip6.li', 'irish2me.com', 'jnxjn.com',
            'jourrapide.com', 'jsrsolutions.com', 'junk1e.com', 'kaspop.com',
            'klzlk.com', 'kulturbetrieb.info', 'kurzepost.de', 'lawlita.com',
            'letthemeatspam.com', 'lhsdv.com', 'libox.fr', 'link2mail.net',
            'litedrop.com', 'lookugly.com', 'lopl.co.cc', 'lortemail.dk',
            'lr78.com', 'lroid.com', 'lukop.dk', 'mail.by',
            'mail.mezimages.net', 'mail2rss.org', 'mail333.com', 'mail4trash.com',
            'mailbidon.com', 'mailbiz.biz', 'mailblocks.com', 'mailbucket.org',
            'mailcatch.com', 'maildrop.cc', 'maildrop.cf', 'maildrop.ga',
            'maildrop.gq', 'maildrop.ml', 'maileater.com', 'mailed.ro',
            'mailexpire.com', 'mailfa.tk', 'mailforspam.com', 'mailfree.ga',
            'mailfree.gq', 'mailfree.ml', 'mailguard.me', 'mailhazard.com',
            'mailhazard.us', 'mailhz.me', 'mailimate.com', 'mailin8r.com',
            'mailinatar.com', 'mailinatar.tk', 'mailinator.com', 'mailinator.net',
            'mailinator.org', 'mailinator2.com', 'mailincubator.com', 'mailismagic.com',
            'mailme.lv', 'mailmetrash.com', 'mailmoat.com', 'mailnator.com',
            'mailnesia.com', 'mailnull.com', 'mailpick.biz', 'mailrock.biz',
            'mailscrap.com', 'mailshell.com', 'mailsiphon.com', 'mailtemp.info',
            'mailtome.de', 'mailtothis.com', 'mailtrash.net', 'mailtv.net',
            'mailtv.tv', 'mailzilla.com', 'mailzilla.org', 'makemetheking.com',
            'manybrain.com', 'mbx.cc', 'mega.zik.dj', 'meltmail.com',
            'messagebeamer.de', 'mierdamail.com', 'mintemail.com', 'mjukglass.nu',
            'mobi.web.id', 'moburl.com', 'moncourrier.fr.nf', 'monemail.fr.nf',
            'monmail.fr.nf', 'mt2009.com', 'mt2014.com', 'mycard.net.ua',
            'mycleaninbox.net', 'mymail-in.net', 'mymailoasis.com', 'mypartyclip.de',
            'myphantomemail.com', 'myspaceinc.com', 'myspaceinc.net', 'myspaceinc.org',
            'myspacepimpedup.com', 'myspamless.com', 'mytrashmail.com', 'neomailbox.com',
            'nepwk.com', 'nervmich.net', 'nervtmich.net', 'netmails.com',
            'netmails.net', 'netzidiot.de', 'neverbox.com', 'nice-4u.com',
            'nincsmail.hu', 'nnh.com', 'no-spam.ws', 'noblepioneer.com',
            'nobugmail.com', 'noclickemail.com', 'nogmailspam.info', 'nomail.xl.cx',
            'nomail2me.com', 'nomorespamemails.com', 'nonspam.eu', 'nonspammer.de',
            'noref.in', 'nospam.ze.tc', 'nospam4.us', 'nospamfor.us',
            'nospammail.net', 'notmailinator.com', 'nowmymail.com', 'ntlhelp.net',
            'nullbox.info', 'nwldx.com', 'objectmail.com', 'obobbo.com',
            'odnorazovoe.ru', 'oneoffemail.com', 'onewaymail.com', 'onlatedotcom.info',
            'online.ms', 'oopi.org', 'opayq.com', 'ordinaryamerican.net',
            'owlpic.com', 'pancakemail.com', 'pcusers.otherinbox.com', 'pjkly.com',
            'plexolan.de', 'pookmail.com', 'proxymail.eu', 'prtnx.com',
            'putthisinyourspamdatabase.com', 'quickinbox.com', 'rcpt.at', 'reallymymail.com',
            'realtyalerts.ca', 'recode.me', 'recursor.net', 'regbypass.comsafe-mail.net',
            'safetymail.info', 'safetypost.de', 'sandelf.de', 'saynotospams.com',
            'schafmail.de', 'schrott-email.de', 'secretemail.de', 'secure-mail.biz',
            'senseless-entertainment.com', 'services391.com', 'shieldedmail.com', 'shitmail.me',
            'shitmail.org', 'shitware.nl', 'shmeriously.com', 'shortmail.net',
            'sibmail.com', 'skeefmail.com', 'slaskpost.se', 'slopsbox.com',
            'slushmail.com', 'smellfear.com', 'snakemail.com', 'sneakemail.com',
            'snkmail.com', 'sofimail.com', 'sofort-mail.de', 'sogetthis.com',
            'soodonims.com', 'spam.la', 'spam.su', 'spam4.me',
            'spamail.de', 'spambob.com', 'spambob.net', 'spambob.org',
            'spambog.com', 'spambog.de', 'spambog.net', 'spambog.ru',
            'spambox.info', 'spambox.irishspringtours.com', 'spambox.us', 'spamcannon.com',
            'spamcannon.net', 'spamcero.com', 'spamcon.org', 'spamcorptastic.com',
            'spamcowboy.com', 'spamcowboy.net', 'spamcowboy.org', 'spamday.com',
            'spamex.com', 'spamfree24.com', 'spamfree24.de', 'spamfree24.eu',
            'spamfree24.info', 'spamfree24.net', 'spamfree24.org', 'spamgourmet.com',
            'spamgourmet.net', 'spamgourmet.org', 'spamherelots.com', 'spamhereplease.com',
            'spamhole.com', 'spamify.com', 'spaminator.de', 'spamkill.info',
            'spaml.com', 'spaml.de', 'spammotel.com', 'spamobox.com',
            'spamoff.de', 'spamslicer.com', 'spamspot.com', 'spamstack.net',
            'spamthis.co.uk', 'spamthisplease.com', 'spamtrail.com', 'spamtroll.net',
            'speed.1s.fr', 'spoofmail.de', 'stuffmail.de', 'super-auswahl.de',
            'supergreatmail.com', 'supermailer.jp', 'superrito.com', 'superstachel.de',
            'suremail.info', 'talkinator.com', 'tapchicuoihoi.com', 'teewars.org',
            'teleworm.com', 'teleworm.us', 'temp-mail.org', 'temp-mail.ru',
            'tempalias.com', 'tempe-mail.com', 'tempemail.biz', 'tempemail.com',
            'tempinbox.co.uk', 'tempinbox.com', 'tempmail.eu', 'tempmail2.com',
            'tempmaildemo.com', 'tempmailer.com', 'tempmailer.de', 'tempomail.fr',
            'temporarily.de', 'temporarioemail.com.br', 'temporaryemail.net', 'temporaryforwarding.com',
            'temporaryinbox.com', 'temporarymailaddress.com', 'tempthe.net', 'tempymail.com',
            'thanksnospam.info', 'thankyou2010.com', 'thecloudindex.com', 'thisisnotmyrealemail.com',
            'throwawayemailaddresses.com', 'tilien.com', 'toomail.biz', 'tradermail.info',
            'trash-amil.com', 'trash-mail.at', 'trash-mail.com', 'trash-mail.de',
            'trash2009.com', 'trashdevil.com', 'trashdevil.de', 'trashemail.de',
            'trashmail.at', 'trashmail.com', 'trashmail.de', 'trashmail.me',
            'trashmail.net', 'trashmail.org', 'trashmail.ws', 'trashmailer.com',
            'trashymail.com', 'trashymail.net', 'trbvm.com', 'turual.com',
            'twinmail.de', 'tyldd.com', 'uggsrock.com', 'umail.net',
            'upliftnow.com', 'uplipht.com', 'uroid.com', 'us.af',
            'venompen.com', 'veryrealemail.com', 'viditag.com', 'viewcastmedia.com',
            'viewcastmedia.net', 'viewcastmedia.org', 'vomoto.com', 'vpn.st',
            'vsimcard.com', 'vubby.com', 'wasteland.rfc822.org', 'webemail.me',
            'weg-werf-email.de', 'wegwerf-emails.de', 'wegwerfadresse.de', 'wegwerfemail.com',
            'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.info', 'wegwerfmail.net',
            'wegwerfmail.org', 'wetrainbayarea.com', 'wetrainbayarea.org', 'wh4f.org',
            'whatiaas.com', 'whatpaas.com', 'whyspam.me', 'willselfdestruct.com',
            'winemaven.info', 'wronghead.com', 'wuzup.net', 'wuzupmail.net',
            'www.e4ward.com', 'www.gishpuppy.com', 'www.mailinator.com', 'wwwnew.eu',
            'x.ip6.li', 'xagloo.com', 'xemaps.com', 'xents.com',
            'xmaily.com', 'xoxy.net', 'yapped.net', 'yeah.net',
            'yep.it', 'yogamaven.com', 'yopmail.com', 'yopmail.fr',
            'yopmail.net', 'yourdomain.com', 'ypmail.webredirect.org', 'yuurok.com',
            'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com', 'zoemail.org',
            
            // Additional temporary email providers
            'guerrillamailblock.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la',
            'pokemail.net', 'spam4.me', 'bccto.me', 'chacuo.net',
            'disbox.net', 'disbox.org', 'anonbox.net', 'anonymail.dk',
            'mailinator.us', 'mailinator.gq', 'safetymail.info', 'tmpmail.org',
            'tmpmail.net', 'temp-mail.de', 'temp-mail.io', 'throwaway.email',
            'getnada.com', 'tempail.com', 'tempmailaddress.com', 'maildrop.cc',
            'guerrillamail.info', 'guerrillamail.org', 'guerrillamail.de'
        ]);

        // Additional patterns to detect temporary emails
        this.temporaryPatterns = [
            /temp/i, /disposable/i, /trash/i, /spam/i, /fake/i, /throwaway/i,
            /guerrilla/i, /mailinator/i, /10minute/i, /temporary/i
        ];
    }

    /**
     * Check if an email domain is from a temporary email service
     */
    isTemporaryEmail(email) {
        const domain = email.toLowerCase().split('@')[1];
        
        if (!domain) {
            return true; // Invalid email format
        }

        // Check against known temporary domains
        if (this.temporaryEmailDomains.has(domain)) {
            return true;
        }

        // Check against patterns
        return this.temporaryPatterns.some(pattern => pattern.test(domain));
    }

    /**
     * Validate email format and check if it's temporary
     */
    validateEmail(email) {
        // Basic email regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
            return {
                isValid: false,
                isTemporary: false,
                reason: 'Invalid email format'
            };
        }

        const isTemporary = this.isTemporaryEmail(email);
        
        return {
            isValid: true,
            isTemporary,
            reason: isTemporary ? 'Temporary or disposable email detected' : null
        };
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(user, baseUrl) {
        try {
            // Check if user can receive verification email
            const canReceive = user.canReceiveVerificationEmail();
            if (!canReceive.canSend) {
                throw new Error(canReceive.reason);
            }

            // Generate verification token
            const token = user.generateEmailVerificationToken();
            
            // Increment verification attempts
            user.verificationAttempts += 1;
            await user.save();

            // Create verification URL
            const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}&id=${user._id}`;

            // Email template
            const mailOptions = {
                from: {
                    name: 'Bulk Email Verifier',
                    address: process.env.EMAIL_USER
                },
                to: user.email,
                subject: 'Verify Your Email Address - Bulk Email Verifier',
                html: this.getVerificationEmailTemplate(user.username, verificationUrl, token),
                // Add reply-to for better deliverability
                replyTo: process.env.EMAIL_USER
            };

            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            
            console.log('Verification email sent:', info.messageId);
            return {
                success: true,
                messageId: info.messageId,
                message: 'Verification email sent successfully'
            };

        } catch (error) {
            console.error('Error sending verification email:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get verification email template
     */
    getVerificationEmailTemplate(username, verificationUrl, token) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🛡️ Verify Your Email Address</h1>
                </div>
                <div class="content">
                    <h2>Hello ${username}!</h2>
                    <p>Thank you for registering with <strong>Bulk Email Verifier</strong>. To complete your registration and start using our email verification service, please verify your email address.</p>
                    
                    <div style="text-align: center;">
                        <a href="${verificationUrl}" class="button">Verify Email Address</a>
                    </div>
                    
                    <p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; background: #f1f1f1; padding: 10px; border-radius: 5px;">
                        ${verificationUrl}
                    </p>
                    
                    <div class="warning">
                        <strong>⚠️ Important:</strong>
                        <ul>
                            <li>This verification link will expire in <strong>24 hours</strong></li>
                            <li>You must verify your email to access your account</li>
                            <li>If you didn't create this account, please ignore this email</li>
                        </ul>
                    </div>
                    
                    <h3>What's Next?</h3>
                    <p>Once your email is verified, you'll be able to:</p>
                    <ul>
                        <li>✅ Access your dashboard</li>
                        <li>✅ Upload and verify email lists</li>
                        <li>✅ Use your free 100 verification credits</li>
                        <li>✅ Purchase additional credits as needed</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>© 2024 Bulk Email Verifier. All rights reserved.</p>
                    <p>This email was sent from ${process.env.EMAIL_USER}. If you received this in error, please ignore it.</p>
                    <p>For support, contact us at ${process.env.EMAIL_USER}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Verify email token
     */
    async verifyEmailToken(userId, token) {
        try {
            const user = await User.findById(userId);
            
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            if (user.isEmailVerified) {
                return {
                    success: false,
                    error: 'Email is already verified'
                };
            }

            if (!user.verifyEmailToken(token)) {
                return {
                    success: false,
                    error: 'Invalid or expired verification token'
                };
            }

            // Verify the email
            await user.verifyEmail();

            return {
                success: true,
                message: 'Email verified successfully'
            };

        } catch (error) {
            console.error('Error verifying email token:', error);
            return {
                success: false,
                error: 'Failed to verify email'
            };
        }
    }

    /**
     * Resend verification email
     */
    async resendVerificationEmail(userId, baseUrl) {
        try {
            const user = await User.findById(userId);
            
            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            if (user.isEmailVerified) {
                return {
                    success: false,
                    error: 'Email is already verified'
                };
            }

            return await this.sendVerificationEmail(user, baseUrl);

        } catch (error) {
            console.error('Error resending verification email:', error);
            return {
                success: false,
                error: 'Failed to resend verification email'
            };
        }
    }

    /**
     * Test SMTP connection
     */
    async testConnection() {
        try {
            console.log('🔍 Testing SMTP connection...');
            console.log('SMTP Config:', {
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT,
                secure: process.env.EMAIL_SECURE,
                user: process.env.EMAIL_USER
            });

            await this.transporter.verify();
            console.log('✅ SMTP connection successful');
        } catch (error) {
            console.error('❌ SMTP connection failed:', error.message);
            console.error('Please check your email configuration in .env file');
        }
    }

    /**
     * Send test email (for debugging)
     */
    async sendTestEmail(toEmail) {
        try {
            const testMailOptions = {
                from: {
                    name: 'Bulk Email Verifier',
                    address: process.env.EMAIL_USER
                },
                to: toEmail,
                subject: 'SMTP Test Email - Bulk Email Verifier',
                html: `
                    <h2>SMTP Test Successful!</h2>
                    <p>This is a test email to verify that your SMTP configuration is working correctly.</p>
                    <p><strong>SMTP Server:</strong> ${process.env.EMAIL_HOST}</p>
                    <p><strong>Port:</strong> ${process.env.EMAIL_PORT}</p>
                    <p><strong>From:</strong> ${process.env.EMAIL_USER}</p>
                    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                `,
                replyTo: process.env.EMAIL_USER
            };

            const info = await this.transporter.sendMail(testMailOptions);
            console.log('✅ Test email sent successfully:', info.messageId);
            
            return {
                success: true,
                messageId: info.messageId,
                message: 'Test email sent successfully'
            };
        } catch (error) {
            console.error('❌ Test email failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new EmailVerificationService();