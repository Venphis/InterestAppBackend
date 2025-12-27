const { validationResult } = require('express-validator');
const Language = require('../models/Language');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const logAuditEvent = require('../utils/auditLogger');

const { DEFAULT_LANG } = require('../config/i18n'); // u Ciebie: 'pl'
const normalizeCode = (code) => String(code || '').trim().toLowerCase();

const createLanguage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const code = normalizeCode(req.body.code);
    const name = String(req.body.name || '').trim();
    const nativeName = String(req.body.nativeName || '').trim();

    const exists = await Language.findOne({ code });
    if (exists) return res.status(400).json({ message: 'Language code already exists.' });

    const lang = await Language.create({ code, name, nativeName, isArchived: false });

    await logAuditEvent(
      'admin_created_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: lang._id },
      { code: lang.code, name: lang.name, nativeName: lang.nativeName },
      req
    );

    return res.status(201).json(lang);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Language code already exists.' });
    next(err);
  }
};

const getLanguages = async (req, res, next) => {
  try {
    const showArchived = String(req.query.showArchived || 'false') === 'true';
    const q = showArchived ? {} : { isArchived: false };
    const langs = await Language.find(q).sort({ name: 1, code: 1 }).lean();
    res.json(langs);
  } catch (err) {
    next(err);
  }
};

const getLanguageById = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId).lean();
    if (!lang) return res.status(404).json({ message: 'Language not found.' });
    res.json(lang);
  } catch (err) {
    next(err);
  }
};

// Migracja kluczy i18n: en -> en-us (w Interest i InterestCategory)
// Uwaga: używa "pipeline update" (MongoDB 4.2+). Jeśli masz starsze Mongo, daj znać – zrobi się pętlą.
const migrateI18nKey = async (oldCode, newCode) => {
  const oldKey = `i18n.${oldCode}`;
  const newKey = `i18n.${newCode}`;

  await Interest.updateMany(
    { [oldKey]: { $exists: true } },
    [
      { $set: { [newKey]: `$${oldKey}` } },
      { $unset: [oldKey] },
    ]
  );

  await InterestCategory.updateMany(
    { [oldKey]: { $exists: true } },
    [
      { $set: { [newKey]: `$${oldKey}` } },
      { $unset: [oldKey] },
    ]
  );
};

const updateLanguage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const languageId = req.params.languageId;

    const lang = await Language.findById(languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found.' });

    const oldData = { code: lang.code, name: lang.name, nativeName: lang.nativeName, isArchived: lang.isArchived };

    // blokady dla domyślnego języka
    if (lang.code === DEFAULT_LANG) {
      if (req.body.code && normalizeCode(req.body.code) !== DEFAULT_LANG) {
        return res.status(400).json({ message: `Cannot change code of default language (${DEFAULT_LANG}).` });
      }
      if (req.body.isArchived === true) {
        return res.status(400).json({ message: `Cannot archive default language (${DEFAULT_LANG}).` });
      }
    }

    let oldCode = lang.code;
    let newCode = lang.code;

    if (req.body.code !== undefined) {
      newCode = normalizeCode(req.body.code);
      lang.code = newCode;
    }
    if (req.body.name !== undefined) lang.name = String(req.body.name).trim();
    if (req.body.nativeName !== undefined) lang.nativeName = String(req.body.nativeName).trim();
    if (req.body.isArchived !== undefined) lang.isArchived = !!req.body.isArchived;

    const updated = await lang.save();

    // jeśli zmienił się skrót – migruj klucze i18n w danych
    if (oldCode !== newCode) {
      await migrateI18nKey(oldCode, newCode);
    }

    await logAuditEvent(
      'admin_updated_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: updated._id },
      { oldData, newData: { code: updated.code, name: updated.name, nativeName: updated.nativeName, isArchived: updated.isArchived } },
      req
    );

    res.json(updated);
  } catch (err) {
    if (err?.code === 11000) return res.status(400).json({ message: 'Language code already exists.' });
    next(err);
  }
};

const archiveLanguage = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found.' });

    if (lang.code === DEFAULT_LANG) {
      return res.status(400).json({ message: `Cannot archive default language (${DEFAULT_LANG}).` });
    }

    if (lang.isArchived) {
      return res.status(200).json({ message: 'Language already archived.' });
    }

    lang.isArchived = true;
    await lang.save();

    await logAuditEvent(
      'admin_archived_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: lang._id },
      { code: lang.code, name: lang.name },
      req
    );

    res.json({ message: 'Language archived successfully.' });
  } catch (err) {
    next(err);
  }
};

const restoreLanguage = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found.' });

    if (!lang.isArchived) {
      return res.status(200).json({ message: 'Language is not archived.' });
    }

    lang.isArchived = false;
    await lang.save();

    await logAuditEvent(
      'admin_restored_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: lang._id },
      { code: lang.code, name: lang.name },
      req
    );

    res.json({ message: 'Language restored successfully.', language: lang });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createLanguage,
  getLanguages,
  getLanguageById,
  updateLanguage,
  archiveLanguage,
  restoreLanguage,
};
