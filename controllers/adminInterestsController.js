const Interest = require('../models/Interest');
const InterestCategory = require('../models/InterestCategory');
const UserInterest = require('../models/UserInterest'); 
const { validationResult } = require('express-validator');
const logAuditEvent = require('../utils/auditLogger');

const createInterestCategory = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, description } = req.body;
    try {
        const categoryExists = await InterestCategory.findOne({ name: { $regex: `^${name}$`, $options: 'i' } }); 
        if (categoryExists) {
            return res.status(400).json({ message: 'Interest category with this name already exists.' });
        }
        const category = await InterestCategory.create({ name, description });
        await logAuditEvent('admin_created_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: category._id }, { categoryName: name }, req);
        res.status(201).json(category);
    } catch (error) {
        console.error('[adminInterestsCtrl] Create Interest Category Error:', error);
        next(error);
    }
};

const getAllInterestCategories = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const categories = await InterestCategory.find().sort('name');
        res.json(categories);
    } catch (error) {
        console.error('[adminInterestsCtrl] Get All Interest Categories Error:', error);
        next(error);
    }
};

const updateInterestCategory = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, description } = req.body;
    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) return res.status(404).json({ message: 'Interest category not found.' });
        const oldName = category.name;
        if (name) {
            const existingCategory = await InterestCategory.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, _id: { $ne: req.params.categoryId } });
            if (existingCategory) return res.status(400).json({ message: 'Another category with this name already exists.' });
            category.name = name;
        }
        if (description !== undefined) category.description = description;
        const updatedCategory = await category.save();
        await logAuditEvent('admin_updated_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: updatedCategory._id }, { oldName, newName: updatedCategory.name, updatedFields: req.body }, req);
        res.json(updatedCategory);
    } catch (error) {
        console.error('[adminInterestsCtrl] Update Interest Category Error:', error);
        next(error);
    }
};

const deleteInterestCategory = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const category = await InterestCategory.findById(req.params.categoryId);
        if (!category) return res.status(404).json({ message: 'Interest category not found.' });
        const interestsInCategory = await Interest.countDocuments({ category: req.params.categoryId, isArchived: false });
        if (interestsInCategory > 0) {
            return res.status(400).json({ message: `Cannot delete category. It still contains ${interestsInCategory} active interest(s). Please archive or reassign them first.`});
        }
        await Interest.updateMany({ category: req.params.categoryId }, { $unset: { category: "" } });
        const categoryName = category.name;
        await InterestCategory.deleteOne({ _id: req.params.categoryId });
        await logAuditEvent('admin_deleted_interest_category', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest_category', id: req.params.categoryId }, { categoryName }, req);
        res.json({ message: 'Interest category deleted successfully. Interests under this category have their category unassigned.' });
    } catch (error) {
        console.error('[adminInterestsCtrl] Delete Interest Category Error:', error);
        next(error);
    }
};


// --- Interest Management ---

const createInterest = async (req, res, next) => { 
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, categoryId, description } = req.body;

    try {
        if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Specified interest category not found.' });
        }
        const duplicate = await Interest.findOne({
          name: { $regex: `^${name}$`, $options: 'i' },
          category: categoryId,
          isArchived: { $ne: true }
        });

        if (duplicate) {
          return res
            .status(400)
            .json({ message: 'Active interest with this name and category already exists.' });
        }

        const interest = await Interest.create({
            name,
            category: categoryId || null,
            description,
            isArchived: false
        });

        await logAuditEvent(
          'admin_created_interest',
          { type: 'admin', id: req.adminUser._id },
          'admin_action',
          { type: 'interest', id: interest._id },
          { interestName: name, categoryId },
          req
        );
        const populatedInterest = await Interest.findById(interest._id).populate('category', 'name');
        res.status(201).json(populatedInterest);
    } catch (error) {
        console.error('[adminInterestsCtrl] Admin Create Interest Error:', error);
        if (error.code === 11000) return res.status(400).json({ message: 'An interest with this name (and category) already exists or violates a unique index.' });
        next(error);
    }
};

// @desc    Get all interests (admin view - can see archived)
// @route   GET /api/admin/interests
// @access  Private (Admin/Superadmin/Moderator)
const getAllInterestsAdmin = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { categoryId, name, showArchived } = req.query;
    const query = {};
    if (categoryId) query.category = categoryId;
    if (name) query.name = { $regex: name, $options: 'i' };
    if (showArchived !== 'true') query.isArchived = false;
    try {
        const interests = await Interest.find(query).populate('category', 'name').sort({ isArchived: 1, name: 1 }).skip(skip).limit(limit);
        const totalInterests = await Interest.countDocuments(query);
        res.json({ interests, currentPage: page, totalPages: Math.ceil(totalInterests / limit), totalInterests });
    } catch (error) {
        console.error('[adminInterestsCtrl] Admin Get All Interests Error:', error);
        next(error);
    }
};

const updateInterest = async (req, res, next) => { 
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, categoryId, description, isArchived } = req.body;
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found.' });
        const oldData = { name: interest.name, category: interest.category, description: interest.description, isArchived: interest.isArchived };
        if (categoryId === null || categoryId === '') {
            interest.category = null;
        } else if (categoryId) {
            const catExists = await InterestCategory.findById(categoryId);
            if (!catExists) return res.status(404).json({ message: 'Specified interest category not found.' });
            interest.category = categoryId;
        }
        if (name) {
            const newCategoryForUniqueness = categoryId !== undefined ? (categoryId || null) : interest.category;
            const existingInterest = await Interest.findOne({ name: { $regex: `^${name}$`, $options: 'i' }, category: newCategoryForUniqueness, _id: { $ne: req.params.interestId }, isArchived: false });
            if (existingInterest) return res.status(400).json({ message: 'Another active interest with this name (and category) already exists.' });
            interest.name = name;
        }
        if (description !== undefined) interest.description = description;
        if (isArchived !== undefined) interest.isArchived = isArchived;
        const updatedInterest = await interest.save();
        await logAuditEvent('admin_updated_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: updatedInterest._id }, { oldData, newData: { name, categoryId, description, isArchived } }, req);
        const populatedInterest = await Interest.findById(updatedInterest._id).populate('category', 'name');
        res.json(populatedInterest);
    } catch (error) {
        console.error('[adminInterestsCtrl] Admin Update Interest Error:', error);
        if (error.code === 11000) return res.status(400).json({ message: 'An interest with this name (and category) already exists or violates a unique index.' });
        next(error);
    }
};


// @desc    Archive an interest (soft delete)
// @route   DELETE /api/admin/interests/:interestId (lub PUT .../archive)
// @access  Private (Admin/Superadmin)
const archiveInterest = async (req, res, next) => { 
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { interestId } = req.params;
        const interest = await Interest.findById(interestId);
        if (!interest) {
            return res.status(404).json({ message: 'Interest not found.' });
        }
        if (interest.isArchived) {
            return res.status(400).json({ message: 'Interest is already archived.' });
        }
        interest.isArchived = true;
        await interest.save({ validateBeforeSave: false }); 

        await logAuditEvent(
            'admin_archived_interest',
            { type: 'admin', id: req.adminUser._id },
            'admin_action',
            { type: 'interest', id: interest._id },
            { interestName: interest.name },
            req
        );
        const populatedInterest = await Interest.findById(interest._id).populate('category', 'name');
        res.status(200).json({ message: 'Interest archived successfully.', interest: populatedInterest });
    } catch (error) {
        console.error('[adminInterestsCtrl] Admin Archive Interest Error:', error);
        next(error);
    }
};

// @desc    Restore an archived interest
// @route   PUT /api/admin/interests/:interestId/restore
// @access  Private (Admin/Superadmin)
const restoreInterest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const interest = await Interest.findById(req.params.interestId);
        if (!interest) return res.status(404).json({ message: 'Interest not found.' });
        if (!interest.isArchived) return res.status(400).json({ message: 'Interest is not archived.' });
        const activeDuplicate = await Interest.findOne({ name: interest.name, category: interest.category, isArchived: false });
        if (activeDuplicate) return res.status(400).json({ message: 'Cannot restore. An active interest with the same name and category already exists.' });
        interest.isArchived = false;
        await interest.save();
        await logAuditEvent('admin_restored_interest', { type: 'admin', id: req.adminUser._id }, 'admin_action', { type: 'interest', id: interest._id }, { interestName: interest.name }, req);
        const populatedInterest = await Interest.findById(interest._id).populate('category', 'name');
        res.json({ message: 'Interest restored successfully.', interest: populatedInterest });
    } catch (error) {
        console.error('[adminInterestsCtrl] Admin Restore Interest Error:', error);
        next(error);
    }
};


module.exports = {
    createInterestCategory,
    getAllInterestCategories,
    updateInterestCategory,
    deleteInterestCategory,
    createInterest,
    getAllInterestsAdmin,
    updateInterest,
    archiveInterest,
    restoreInterest  
};