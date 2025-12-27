const Language = require('../models/Language');

async function ensurePolishLanguage() {
  // DODA tylko jeśli nie ma - nic nie nadpisuje, nic nie usuwa, nie dotyka innych języków
  await Language.updateOne(
    { code: 'pl' },
    {
      $setOnInsert: {
        code: 'pl',
        name: 'Polski',
        nativeName: 'Polski',
        isArchived: false,
      },
    },
    { upsert: true }
  );
}

module.exports = { ensurePolishLanguage };
