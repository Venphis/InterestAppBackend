const { validationResult } = require('express-validator');
const Language = require('../models/Language');
const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const logAuditEvent = require('../utils/auditLogger');
const { DEFAULT_LANG } = require('../config/i18n');

const normalizeCode = (code) => String(code || '').trim().toLowerCase();

const createLanguage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const code = normalizeCode(req.body.code);
    const { name, nativeName } = req.body;

    const exists = await Language.findOne({ code });
    if (exists) return res.status(400).json({ message: 'Language code already exists' });

    const lang = await Language.create({ 
      code, 
      name: String(name).trim(), 
      nativeName: String(nativeName).trim(), 
      isArchived: false 
    });

    await logAuditEvent(
      'admin_created_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: lang._id },
      { code: lang.code, name: lang.name },
      req
    );

    return res.status(201).json(lang);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Language code duplicate' });
    next(err);
  }
};

const getLanguages = async (req, res, next) => {
  try {
    const showArchived = req.query.showArchived === 'true';
    const query = showArchived ? {} : { isArchived: false };
    
    const languages = await Language.find(query).sort({ name: 1, code: 1 }).lean();
    res.json(languages);
  } catch (err) {
    next(err);
  }
};

const getLanguageById = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId).lean();
    if (!lang) return res.status(404).json({ message: 'Language not found' });
    res.json(lang);
  } catch (err) {
    next(err);
  }
};

// Renames i18n keys in related collections (Interests, Categories) using aggregation pipeline
const migrateI18nKey = async (oldCode, newCode) => {
  const oldKey = `i18n.${oldCode}`;
  const newKey = `i18n.${newCode}`;
  const updatePipeline = [
    { $set: { [newKey]: `$${oldKey}` } },
    { $unset: [oldKey] },
  ];

  await Promise.all([
    Interest.updateMany({ [oldKey]: { $exists: true } }, updatePipeline),
    InterestCategory.updateMany({ [oldKey]: { $exists: true } }, updatePipeline)
  ]);
};

const updateLanguage = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const lang = await Language.findById(req.params.languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found' });

    const oldData = { ...lang.toObject() };
    const oldCode = lang.code;
    
    // Default language protection
    if (oldCode === DEFAULT_LANG) {
      if (req.body.code && normalizeCode(req.body.code) !== DEFAULT_LANG) {
        return res.status(400).json({ message: `Cannot change code of default language (${DEFAULT_LANG})` });
      }
      if (req.body.isArchived === true) {
        return res.status(400).json({ message: `Cannot archive default language (${DEFAULT_LANG})` });
      }
    }

    // Update fields
    if (req.body.code) lang.code = normalizeCode(req.body.code);
    if (req.body.name) lang.name = String(req.body.name).trim();
    if (req.body.nativeName) lang.nativeName = String(req.body.nativeName).trim();
    if (req.body.isArchived !== undefined) lang.isArchived = !!req.body.isArchived;

    const updated = await lang.save();

    // Trigger migration if code changed
    if (oldCode !== updated.code) {
      await migrateI18nKey(oldCode, updated.code);
    }

    await logAuditEvent(
      'admin_updated_language',
      { type: 'admin', id: req.adminUser._id },
      'admin_action',
      { type: 'language', id: updated._id },
      { oldData, newData: updated.toObject() },
      req
    );

    res.json(updated);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Language code duplicate' });
    next(err);
  }
};

const archiveLanguage = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found' });

    if (lang.code === DEFAULT_LANG) {
      return res.status(400).json({ message: `Cannot archive default language (${DEFAULT_LANG})` });
    }

    if (lang.isArchived) return res.status(400).json({ message: 'Already archived' });

    lang.isArchived = true;
    await lang.save();

    await logAuditEvent('admin_archived_language', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'language', id: lang._id }, { code: lang.code }, req);

    res.json({ message: 'Language archived' });
  } catch (err) {
    next(err);
  }
};

const restoreLanguage = async (req, res, next) => {
  try {
    const lang = await Language.findById(req.params.languageId);
    if (!lang) return res.status(404).json({ message: 'Language not found' });

    if (!lang.isArchived) return res.status(400).json({ message: 'Language is not archived' });

    lang.isArchived = false;
    await lang.save();

    await logAuditEvent('admin_restored_language', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'language', id: lang._id }, { code: lang.code }, req);

    res.json({ message: 'Language restored', language: lang });
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