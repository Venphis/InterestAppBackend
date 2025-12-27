const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const { validationResult } = require('express-validator');
const { DEFAULT_LANG } = require('../config/i18n');

const normalizeLang = (lang) => String(lang || '').trim().toLowerCase();

const getRequestedLang = (req) => {
  if (req.query.lang) return normalizeLang(req.query.lang);
  if (req.headers['x-lang']) return normalizeLang(req.headers['x-lang']);

  const al = req.headers['accept-language'];
  if (al) return normalizeLang(al.split(',')[0]);

  return DEFAULT_LANG;
};

const getLangFallbacks = (lang) => {
  const out = [];
  const l = normalizeLang(lang);
  if (l) out.push(l);
  if (l && l.includes('-')) out.push(l.split('-')[0]);
  if (DEFAULT_LANG && !out.includes(DEFAULT_LANG)) out.push(DEFAULT_LANG);
  return [...new Set(out)];
};

const pickTranslation = (i18n, lang) => {
  if (!i18n) return null;
  const fallbacks = getLangFallbacks(lang);

  for (const code of fallbacks) {
    const t = typeof i18n.get === 'function' ? i18n.get(code) : i18n[code];
    if (t && (t.name || t.description)) return t;
  }
  return null;
};

const localizeEntity = (entity, lang) => {
  if (!entity) return entity;
  const t = pickTranslation(entity.i18n, lang);
  // usuń i18n z public payload (mniejsze odpowiedzi)
  const { i18n, ...rest } = entity;
  return {
    ...rest,
    name: t?.name || entity.name,
    description: t?.description ?? entity.description ?? '',
  };
};

const getPublicInterestCategories = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const lang = getRequestedLang(req);

  try {
    const categories = await InterestCategory.find().sort('name').lean();
    res.json(categories.map((c) => localizeEntity(c, lang)));
  } catch (error) {
    console.error('Public Get Categories Error:', error);
    res.status(500).json({ message: 'Server Error fetching categories.' });
  }
};

const getPublicInterests = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const lang = getRequestedLang(req);
  const { categoryId, name } = req.query;

  const query = { isArchived: false };
  if (categoryId) query.category = categoryId;

  // szukanie po nazwie: w i18n (lang + fallback) + po bazowym name
  if (name) {
    const fallbacks = getLangFallbacks(lang);
    query.$or = [
      { name: { $regex: name, $options: 'i' } },
      ...fallbacks.map((code) => ({ [`i18n.${code}.name`]: { $regex: name, $options: 'i' } })),
    ];
  }

  try {
    const interests = await Interest.find(query)
      .populate('category', 'name description i18n')
      .sort('name')
      .lean();

    const localized = interests.map((i) => ({
      ...localizeEntity(i, lang),
      category: localizeEntity(i.category, lang),
    }));

    res.json(localized);
  } catch (error) {
    console.error('Public Get Interests Error:', error);
    res.status(500).json({ message: 'Server Error fetching interests.' });
  }
};

module.exports = { getPublicInterestCategories, getPublicInterests };
