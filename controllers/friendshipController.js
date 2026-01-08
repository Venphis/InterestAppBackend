const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// --- Helper: Validate access rights to a friendship
const validateAccess = (friendship, userId) => {
    if (!friendship) throw { status: 404, message: 'Friendship not found' };
    if (!friendship.user1.equals(userId) && !friendship.user2.equals(userId)) {
        throw { status: 403, message: 'Unauthorized' };
    }
};

// --- Actions ---

const sendFriendRequest = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { recipientId } = req.body;
    const requesterId = req.user._id;

    if (requesterId.equals(recipientId)) return res.status(400).json({ message: 'Cannot friend self' });

    try {
        const recipient = await User.findOne({ _id: recipientId, isDeleted: false, isBanned: false });
        if (!recipient) return res.status(404).json({ message: 'Recipient not found' });

        const existing = await Friendship.findOne({
            $or: [ { user1: requesterId, user2: recipientId }, { user1: recipientId, user2: requesterId } ]
        });

        if (existing) {
            if (existing.isBlocked) return res.status(400).json({ message: 'Blocked' });
            if (existing.status === 'accepted') return res.status(400).json({ message: 'Already friends' });
            if (existing.status === 'pending') {
                return res.status(400).json({ 
                    message: existing.requestedBy.equals(requesterId) ? 'Request already sent' : 'Request already received' 
                });
            }
            if (existing.status === 'rejected') return res.status(400).json({ message: 'Previous request rejected' });
        }

        const newFriendship = await Friendship.create({
            user1: requesterId,
            user2: recipientId,
            status: 'pending',
            requestedBy: requesterId,
            friendshipType: 'unverified'
        });

        res.status(201).json({ message: 'Request sent', friendship: newFriendship });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Conflict detected' });
        next(error);
    }
};

const acceptFriendRequest = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        if (friendship.status !== 'pending' || friendship.requestedBy.equals(req.user._id)) {
            return res.status(400).json({ message: 'Cannot accept this request' });
        }
        if (friendship.isBlocked) return res.status(400).json({ message: 'Cannot accept blocked friendship' });

        friendship.status = 'accepted';
        friendship.isBlocked = false;
        friendship.blockedBy = null;
        
        const updated = await friendship.save();
        const populated = await Friendship.findById(updated._id).populate('user1 user2', 'username profile');

        res.json({ message: 'Accepted', friendship: populated });
    } catch (error) {
        next(error);
    }
};

const rejectFriendRequest = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        if (friendship.status !== 'pending' || friendship.requestedBy.equals(req.user._id)) {
            return res.status(400).json({ message: 'Cannot reject this request' });
        }

        friendship.status = 'rejected';
        await friendship.save();

        res.json({ message: 'Rejected' });
    } catch (error) {
        next(error);
    }
};

const removeFriendship = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        const isSender = friendship.requestedBy?.equals(req.user._id);

        if (friendship.status === 'accepted' || (friendship.status === 'pending' && isSender)) {
            await friendship.deleteOne();
            res.json({ message: 'Removed' });
        } else {
            res.status(400).json({ message: 'Cannot remove in current state' });
        }
    } catch (error) {
        next(error);
    }
};

const getFriendships = async (req, res, next) => {
    const userId = req.user._id;
    const { status, friendshipType, direction } = req.query;
    
    let query = { $or: [{ user1: userId }, { user2: userId }] };

    if (status) {
        query.status = status;
        if (status === 'accepted') {
            query.isBlocked = { $ne: true };
            if (friendshipType) query.friendshipType = friendshipType;
        } else if (status === 'blocked') {
            if (direction === 'outgoing') query.blockedBy = userId;
            else if (direction === 'incoming') query.blockedBy = { $ne: userId };
        } else if (status === 'pending') {
            if (direction === 'outgoing') query.requestedBy = userId;
            else if (direction === 'incoming') query.requestedBy = { $ne: userId };
        }
    } else {
        query.status = { $in: ['accepted', 'pending'] };
        query.isBlocked = { $ne: true };
    }

    try {
        const friendships = await Friendship.find(query)
            .populate({ path: 'user1', select: 'username profile', match: { isDeleted: false } })
            .populate({ path: 'user2', select: 'username profile', match: { isDeleted: false } })
            .sort({ createdAt: -1 })
            .lean();

        const result = friendships
            .filter(f => f.user1 && f.user2)
            .map(f => {
                const otherUser = f.user1._id.equals(userId) ? f.user2 : f.user1;
                return {
                    friendshipId: f._id,
                    user: otherUser,
                    status: f.status,
                    friendshipType: f.friendshipType,
                    isPendingRecipient: f.status === 'pending' && !f.requestedBy?.equals(userId),
                    isBlocked: f.isBlocked,
                    blockedBy: f.blockedBy,
                    createdAt: f.createdAt
                };
            });

        const uniqueMap = new Map();
        result.forEach(item => uniqueMap.set(item.user._id.toString(), item));
        
        res.json(Array.from(uniqueMap.values()));
    } catch (error) {
        next(error);
    }
};

const verifyFriendship = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        if (friendship.status !== 'accepted') return res.status(400).json({ message: 'Must be accepted first' });
        if (friendship.isBlocked) return res.status(400).json({ message: 'Cannot verify blocked friendship' });
        if (friendship.friendshipType === 'verified') return res.status(400).json({ message: 'Already verified' });

        friendship.friendshipType = 'verified';
        await friendship.save();

        res.json({ message: 'Verified', friendship });
    } catch (error) {
        next(error);
    }
};

const blockFriendship = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        if (friendship.isBlocked && friendship.blockedBy.equals(req.user._id)) {
            return res.status(400).json({ message: 'Already blocked by you' });
        }
        if (friendship.status !== 'accepted') return res.status(400).json({ message: 'Can only block active friends' });

        friendship.status = 'blocked';
        friendship.isBlocked = true;
        friendship.blockedBy = req.user._id;
        
        await friendship.save();
        res.json({ message: 'Blocked', friendship });
    } catch (error) {
        next(error);
    }
};

const unblockFriendship = async (req, res, next) => {
    try {
        const friendship = await Friendship.findById(req.params.friendshipId);
        validateAccess(friendship, req.user._id);

        if (!friendship.isBlocked) return res.status(400).json({ message: 'Not blocked' });
        if (!friendship.blockedBy.equals(req.user._id)) return res.status(403).json({ message: 'Only blocker can unblock' });

        friendship.status = 'accepted';
        friendship.isBlocked = false;
        friendship.blockedBy = null;

        await friendship.save();
        res.json({ message: 'Unblocked', friendship });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriendship,
    getFriendships,
    verifyFriendship,
    blockFriendship,
    unblockFriendship
};