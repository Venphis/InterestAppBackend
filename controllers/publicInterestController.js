const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { validationResult } = require('express-validator');
const { DEFAULT_LANG } = require('../config/i18n');

// --- Helper Functions ---

const normalizeLang = (lang) => String(lang || '').trim().toLowerCase();

// Determine requested language from Query > Header > Accept-Language > Default
const getRequestedLang = (req) => {
    if (req.query.lang) return normalizeLang(req.query.lang);
    if (req.headers['x-lang']) return normalizeLang(req.headers['x-lang']);
    
    const acceptLang = req.headers['accept-language'];
    if (acceptLang) return normalizeLang(acceptLang.split(',')[0]);

    return DEFAULT_LANG;
};

// Generate fallback chain (e.g. en-us -> en -> default)
const getLangFallbacks = (lang) => {
    const fallbacks = new Set();
    const normalized = normalizeLang(lang);
    
    if (normalized) {
        fallbacks.add(normalized);
        if (normalized.includes('-')) fallbacks.add(normalized.split('-')[0]);
    }
    fallbacks.add(DEFAULT_LANG);
    
    return Array.from(fallbacks);
};

// Find best matching translation from i18n object
const pickTranslation = (i18n, lang) => {
    if (!i18n) return null;
    const fallbacks = getLangFallbacks(lang);

    for (const code of fallbacks) {
        const t = typeof i18n.get === 'function' ? i18n.get(code) : i18n[code];
        if (t && (t.name || t.description)) return t;
    }
    return null;
};

// Apply translation to entity and remove raw i18n data
const localizeEntity = (entity, lang) => {
    if (!entity) return entity;
    
    const translation = pickTranslation(entity.i18n, lang);
    const { i18n, ...rest } = entity; // Exclude raw i18n data

    return {
        ...rest,
        name: translation?.name || entity.name,
        description: translation?.description ?? entity.description ?? '',
    };
};

// --- Controllers ---

const getPublicInterestCategories = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const lang = getRequestedLang(req);

    try {
        const categories = await InterestCategory.find().sort('name').lean();
        const localizedCategories = categories.map(c => localizeEntity(c, lang));
        res.json(localizedCategories);
    } catch (error) {
        console.error('Get Categories Error:', error.message);
        next(error);
    }
};

const getPublicInterests = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const lang = getRequestedLang(req);
    const { categoryId, name } = req.query;

    const query = { isArchived: false };
    if (categoryId) query.category = categoryId;

    // Search by name in both base field and i18n fallbacks
    if (name) {
        const fallbacks = getLangFallbacks(lang);
        const searchConditions = [
            { name: { $regex: name, $options: 'i' } },
            ...fallbacks.map(code => ({ [`i18n.${code}.name`]: { $regex: name, $options: 'i' } }))
        ];
        query.$or = searchConditions;
    }

    try {
        const interests = await Interest.find(query)
            .populate('category', 'name description i18n')
            .sort('name')
            .lean();

        const localizedInterests = interests.map(i => ({
            ...localizeEntity(i, lang),
            category: localizeEntity(i.category, lang),
        }));

        res.json(localizedInterests);
    } catch (error) {
        console.error('Get Interests Error:', error.message);
        next(error);
    }
};

module.exports = { getPublicInterestCategories, getPublicInterests };