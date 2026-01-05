const nodemailer = require('nodemailer');

// Sends email using Nodemailer (configured for Mailtrap by default)
const sendEmail = async (options) => {
  // @TODO: Replace with SendGrid/AWS SES for actual Production environment
  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT, 
    auth: {
      user: process.env.MAILTRAP_USERNAME,
      pass: process.env.MAILTRAP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `${process.env.EMAIL_FROM_NAME || 'Social App'} <${process.env.EMAIL_FROM_ADDRESS || 'no-reply@socialapp.com'}>`,
    to: options.email,
    subject: options.subject, 
    text: options.message, 
    html: options.htmlMessage || options.message,
  };

  try {
    await transporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV !== 'test') {
        console.log(`Email sent to: ${options.email}`);
    }
  } catch (error) {
    console.error(`Email delivery failed: ${error.message}`);
    throw error; 
  }
};

module.exports = sendEmail;