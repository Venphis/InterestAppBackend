// utils/sendEmail.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const sendEmail = async (options) => {
  // 1) Stwórz transporter (serwis, który faktycznie wyśle email)
  // Użyjemy Mailtrap do developmentu
  let transporter;
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    transporter = nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST, // np. sandbox.smtp.mailtrap.io
      port: process.env.MAILTRAP_PORT, // np. 2525
      auth: {
        user: process.env.MAILTRAP_USERNAME,
        pass: process.env.MAILTRAP_PASSWORD,
      },
    });
  } else {
    // TODO: Skonfiguruj dla produkcji (np. SendGrid, Mailgun)
    // transporter = nodemailer.createTransport({
    //   service: 'SendGrid', // lub inny
    //   auth: {
    //     user: process.env.SENDGRID_USERNAME,
    //     pass: process.env.SENDGRID_PASSWORD,
    //   },
    // });
    // Na razie fallback do Mailtrap, jeśli nie ma konfiguracji produkcyjnej
     console.warn("PRODUCTION EMAIL TRANSPORTER NOT CONFIGURED. Using Mailtrap fallback or failing.");
     transporter = nodemailer.createTransport({
         host: process.env.MAILTRAP_HOST,
         port: process.env.MAILTRAP_PORT,
         auth: { user: process.env.MAILTRAP_USERNAME, pass: process.env.MAILTRAP_PASSWORD,},
     });
  }


  // 2) Zdefiniuj opcje emaila
  const mailOptions = {
  from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>` || 'Social App <no-reply@socialapp.com>',
  to: options.email,
  subject: options.subject, // Temat może też zawierać nazwę aplikacji
  text: options.message,    // W treści wiadomości możesz używać process.env.APP_NAME
  html: options.htmlMessage || options.message,
};

  // 3) Wyślij email
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.email} with subject "${options.subject}"`);
  } catch (error) {
    console.error(`Error sending email to ${options.email}:`, error);
    // Możesz rzucić błąd dalej, jeśli chcesz, aby kontroler go obsłużył
    // throw new Error('There was an error sending the email. Try again later.');
  }
};

module.exports = sendEmail;