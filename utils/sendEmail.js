const nodemailer = require('nodemailer');
require('dotenv').config();

const sendEmail = async (options) => {
  let transporter;
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    transporter = nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST,
      port: process.env.MAILTRAP_PORT, 
      auth: {
        user: process.env.MAILTRAP_USERNAME,
        pass: process.env.MAILTRAP_PASSWORD,
      },
    });
  } else {
     console.warn("PRODUCTION EMAIL TRANSPORTER NOT CONFIGURED. Using Mailtrap fallback or failing.");
     transporter = nodemailer.createTransport({
         host: process.env.MAILTRAP_HOST,
         port: process.env.MAILTRAP_PORT,
         auth: { user: process.env.MAILTRAP_USERNAME, pass: process.env.MAILTRAP_PASSWORD,},
     });
  }

  const mailOptions = {
  from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>` || 'Social App <no-reply@socialapp.com>',
  to: options.email,
  subject: options.subject, 
  text: options.message, 
  html: options.htmlMessage || options.message,
};
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.email} with subject "${options.subject}"`);
  } catch (error) {
    console.error(`Error sending email to ${options.email}:`, error);
  }
};

module.exports = sendEmail;