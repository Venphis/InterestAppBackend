const Language = require('../models/Language');

// Seeds initial languages (EN, PL) into the database if they don't exist
async function ensureDefaultLanguages() {
  const languages = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'pl', name: 'Polski', nativeName: 'Polski' }
  ];

  // Execute operations in parallel for performance
  const operations = languages.map(lang => 
    Language.updateOne(
      { code: lang.code },
      { $setOnInsert: { ...lang, isArchived: false } },
      { upsert: true }
    )
  );

  await Promise.all(operations);
}

// Export as both generic name and the specific name used in server.js
module.exports = { 
    ensureDefaultLanguages, 
    ensurePolishLanguage: ensureDefaultLanguages 
};