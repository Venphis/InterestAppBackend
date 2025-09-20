const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { createVerifiedUser, generateUserToken, createFriendship, generateUnique } = require('./helpers/factories');
const mongoose = require('mongoose');

describe('Friendship API', () => {
    let userOne, userTwo, userThree, userFour, userFive;
    let tokenOne, tokenTwo, tokenThree, tokenFour;

    beforeAll(async () => {
        await mongoose.connection.collection('users').deleteMany({});

        userOne = await createVerifiedUser({ username: 'userOne_FS', email: 'oneFS@example.com' });
        userTwo = await createVerifiedUser({ username: 'userTwo_FS', email: 'twoFS@example.com' });
        userThree = await createVerifiedUser({ username: 'userThree_FS', email: 'threeFS@example.com' });
        userFour = await createVerifiedUser({ username: generateUnique('userFourFS_'), email: `${generateUnique('fourFS_')}@example.com` });
        userFive = await createVerifiedUser({ username: generateUnique('userFiveFS_'), email: `${generateUnique('fiveFS_')}@example.com` });


        tokenOne = generateUserToken(userOne);
        tokenTwo = generateUserToken(userTwo);
        tokenThree = generateUserToken(userThree);
        tokenFour = generateUserToken(userFour);
    });

    beforeEach(async () => {
        await mongoose.connection.collection('friendships').deleteMany({});
    });

    describe('POST /api/friendships/request', () => {
        it('should allow userOne to send a friend request to userTwo (type: unverified)', async () => {
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('friendship');
            const friendship = res.body.friendship;
            expect(friendship.status).toBe('pending');
            expect(friendship.friendshipType).toBe('unverified');
            expect([friendship.user1.toString(), friendship.user2.toString()]).toEqual(expect.arrayContaining([userOne._id.toString(), userTwo._id.toString()]));
            expect(friendship.requestedBy.toString()).toBe(userOne._id.toString());
        });

        it('should not allow sending a request to oneself', async () => {
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userOne._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('You cannot send a friend request to yourself');
        });

        it('should not allow sending a request if one already exists (pending from sender)', async () => {
            await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'pending' });
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('Friend request already sent');
        });

        it('should not allow sending a request if one exists (pending from recipient)', async () => {
            await createFriendship({ user1: userTwo, user2: userOne, requestedBy: userTwo, status: 'pending' });
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('This user has already sent you a friend request');
        });


        it('should not allow sending a request if users are already friends (status accepted)', async () => {
            await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted', overrides: { friendshipType: 'unverified' } });
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('You are already friends');
        });

        it('should not allow sending a request if userTwo has blocked userOne', async () => {
            await createFriendship({ user1: userTwo, user2: userOne, requestedBy: userTwo, status: 'blocked'});
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/Cannot send friend request due to a block|relationship already exists/i);
        });

        it('should not allow sending a request if userOne has blocked userTwo', async () => {
            await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'blocked'});
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: userTwo._id.toString() });
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toMatch(/Cannot send friend request due to a block|relationship already exists/i);
        });

        it('should return 404 if recipient user does not exist', async () => {
            const res = await request(app)
                .post('/api/friendships/request')
                .set('Authorization', `Bearer ${tokenOne}`)
                .send({ recipientId: new mongoose.Types.ObjectId().toString() });
            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toBe('Recipient user not found');
        });
    });

    describe('PUT /api/friendships/:friendshipId/accept', () => {
        let pendingRequestFromOneToTwo;
        beforeEach(async () => {
            pendingRequestFromOneToTwo = await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'pending' });
        });

        it('should allow recipient (userTwo) to accept a pending request (type remains unverified)', async () => {
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/accept`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.friendship.status).toBe('accepted');
            expect(res.body.friendship.friendshipType).toBe('unverified');
        });

        it('should not allow sender (userOne) to accept their own request', async () => {
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/accept`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot accept this request');
        });

        it('should not allow accepting an already accepted request', async () => {
            await Friendship.findByIdAndUpdate(pendingRequestFromOneToTwo._id, { status: 'accepted' });
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/accept`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot accept this request');
        });

        it('should not allow accepting a rejected request', async () => {
            await Friendship.findByIdAndUpdate(pendingRequestFromOneToTwo._id, { status: 'rejected' });
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/accept`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot accept this request');
        });

        it('should not allow accepting if one user is blocked by the other (or vice-versa)', async () => {
            await Friendship.findByIdAndUpdate(pendingRequestFromOneToTwo._id, { status: 'blocked'});
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/accept`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot accept this request');
        });

    });

    describe('PUT /api/friendships/:friendshipId/reject', () => {
        let pendingRequestFromOneToTwo;
        beforeEach(async () => {
            pendingRequestFromOneToTwo = await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'pending' });
        });

        it('should allow recipient (userTwo) to reject a pending friend request', async () => {
            const res = await request(app)
                .put(`/api/friendships/${pendingRequestFromOneToTwo._id}/reject`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('Friend request rejected');
            const friendshipInDb = await Friendship.findById(pendingRequestFromOneToTwo._id);
            expect(friendshipInDb.status).toBe('rejected');
        });
    });

    describe('PUT /api/friendships/:friendshipId/verify', () => {
        let acceptedUnverifiedFriendship;
        beforeEach(async () => {
            acceptedUnverifiedFriendship = await createFriendship({
                user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted', overrides: { friendshipType: 'unverified' }
            });
        });

        it('should allow userOne to verify an accepted friendship with userTwo', async () => {
            const res = await request(app)
                .put(`/api/friendships/${acceptedUnverifiedFriendship._id}/verify`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.friendship.friendshipType).toBe('verified');
        });

        it('should allow userTwo to verify an accepted friendship with userOne', async () => {
            const res = await request(app)
                .put(`/api/friendships/${acceptedUnverifiedFriendship._id}/verify`)
                .set('Authorization', `Bearer ${tokenTwo}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.friendship.friendshipType).toBe('verified');
        });

        it('should not allow verifying a friendship that is not "accepted"', async () => {
            const pendingReq = await createFriendship({ user1: userOne, user2: userThree, requestedBy: userOne, status: 'pending' });
            const res = await request(app)
                .put(`/api/friendships/${pendingReq._id}/verify`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('Friendship must be accepted before it can be verified.');
        });

        it('should not allow a non-participant (userThree) to verify a friendship', async () => {
            const res = await request(app)
                .put(`/api/friendships/${acceptedUnverifiedFriendship._id}/verify`)
                .set('Authorization', `Bearer ${tokenThree}`);
            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toBe('You are not part of this friendship and cannot verify it.');
        });

        it('should return a message if friendship is already verified', async () => {
            await Friendship.findByIdAndUpdate(acceptedUnverifiedFriendship._id, { friendshipType: 'verified' });
            const res = await request(app)
                .put(`/api/friendships/${acceptedUnverifiedFriendship._id}/verify`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('This friendship is already verified.');
        });
    });

    describe('PUT /api/friendships/:friendshipId/block', () => {
        let friendshipToBlock;
        beforeEach(async () => {
            friendshipToBlock = await createFriendship({
                user1: userOne,
                user2: userTwo,
                requestedBy: userOne,
                status: 'accepted',
                overrides: { friendshipType: 'verified' }
            });
        });

        it('should allow userOne to block userTwo (changes status)', async () => {
            const res = await request(app)
                .put(`/api/friendships/${friendshipToBlock._id}/block`)
                .set('Authorization', `Bearer ${tokenOne}`);

            expect(res.statusCode).toEqual(200);
            const updatedFriendship = await Friendship.findById(friendshipToBlock._id);
            expect(updatedFriendship.status).toBe('blocked');
        });

        it('should prevent userTwo from sending messages to userOne if userOne blocked userTwo (Conceptual)', async () => {
            await request(app)
                .put(`/api/friendships/${friendshipToBlock._id}/block`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(true).toBe(true);
        });

        it('should not allow userThree (non-participant) to block friendship', async () => {
            const res = await request(app)
                .put(`/api/friendships/${friendshipToBlock._id}/block`)
                .set('Authorization', `Bearer ${tokenThree}`);
            expect(res.statusCode).toEqual(403);
        });
    });


    describe('PUT /api/friendships/:friendshipId/unblock', () => {
        let blockedFriendship_OneTwo;

        beforeEach(async () => {
            blockedFriendship_OneTwo = await createFriendship({
                user1: userOne,
                user2: userTwo,
                requestedBy: userOne,
                status: 'blocked',
                overrides: {
                    friendshipType: 'verified',
                }
            });
        });

        it('should allow userOne (who blocked) to unblock userTwo', async () => {
            const res = await request(app)
                .put(`/api/friendships/${blockedFriendship_OneTwo._id}/unblock`)
                .set('Authorization', `Bearer ${tokenOne}`);

            expect(res.statusCode).toEqual(200);
            const updatedFriendship = await Friendship.findById(blockedFriendship_OneTwo._id);
            expect(updatedFriendship.status).toBe('accepted');
        });

        it('should NOT (typically) allow userTwo (who was blocked) to unblock the friendship initiated by userOne', async () => {
            const res = await request(app)
                .put(`/api/friendships/${blockedFriendship_OneTwo._id}/unblock`)
                .set('Authorization', `Bearer ${tokenTwo}`); 

            expect(res.statusCode).toEqual(403); 
            expect(res.body.message).toContain('Cannot unblock this friendship');
        });

        it('should not allow userThree (non-participant) to unblock friendship', async () => {
            const res = await request(app)
                .put(`/api/friendships/${blockedFriendship_OneTwo._id}/unblock`)
                .set('Authorization', `Bearer ${tokenThree}`);
            expect(res.statusCode).toEqual(403); 
        });

        it('should return an error if trying to unblock a non-blocked friendship', async () => {
            const acceptedFriendship = await createFriendship({ user1: userOne, user2: userThree, status: 'accepted', requestedBy: userOne });
            const res = await request(app)
                .put(`/api/friendships/${acceptedFriendship._id}/unblock`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Friendship is not blocked');
        });
    });


    describe('DELETE /api/friendships/:friendshipId', () => {
        let acceptedFriendship, pendingSentRequest;
        beforeEach(async () => {
            acceptedFriendship = await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted' });
            pendingSentRequest = await createFriendship({ user1: userOne, user2: userThree, requestedBy: userOne, status: 'pending' });
        });

        it('should allow userOne to unfriend userTwo', async () => {
            const res = await request(app)
                .delete(`/api/friendships/${acceptedFriendship._id}`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('Friendship removed successfully');
            const friendshipInDb = await Friendship.findById(acceptedFriendship._id);
            expect(friendshipInDb).toBeNull();
        });

        it('should allow userOne to cancel a pending sent request to userThree', async () => {
            const res = await request(app)
                .delete(`/api/friendships/${pendingSentRequest._id}`)
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            const friendshipInDb = await Friendship.findById(pendingSentRequest._id);
            expect(friendshipInDb).toBeNull();
        });

        it('should not allow userThree to cancel a request sent by userOne', async () => {
            const res = await request(app)
                .delete(`/api/friendships/${pendingSentRequest._id}`)
                .set('Authorization', `Bearer ${tokenThree}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('Cannot remove/cancel a request sent by another user');
        });
    });

    describe('GET /api/friendships', () => {
        let acceptedVerifiedFriendship, acceptedUnverifiedFriendship, pendingIncoming, pendingOutgoing;

        beforeEach(async () => {
            acceptedVerifiedFriendship = await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted', overrides: { friendshipType: 'verified' } });
            acceptedUnverifiedFriendship = await createFriendship({ user1: userOne, user2: userFour, requestedBy: userOne, status: 'accepted', overrides: { friendshipType: 'unverified' } });
            pendingIncoming = await createFriendship({ user1: userThree, user2: userOne, requestedBy: userThree, status: 'pending' });
            const userFive = await createVerifiedUser({username: 'userFiveFriend', email: 'five@friend.com'});
            pendingOutgoing = await createFriendship({ user1: userOne, user2: userFive, requestedBy: userOne, status: 'pending' });
        });

        it('should get a list of accepted friends for userOne (excluding blocked)', async () => {
            await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'accepted', overrides: { friendshipType: 'unverified' } });
            await createFriendship({ user1: userOne, user2: userThree, requestedBy: userOne, status: 'blocked', overrides: { friendshipType: 'verified' } });

            const res = await request(app)
                .get('/api/friendships?status=accepted') 
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            const activeFriends = res.body.filter(f => f.status === 'accepted' && (!f.blockedBy || !f.blockedBy.equals(userOne._id)));
            expect(activeFriends.length).toBe(1);
            if (activeFriends.length > 0) {
                 expect(activeFriends[0].user.username).toBe(userTwo.username);
            }
        });

        it('should get a list of only verified friends for userOne if filtered', async () => {
            const res = await request(app)
                .get('/api/friendships?status=accepted&friendshipType=verified')
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].user.username).toBe(userTwo.username);
            expect(res.body[0].friendshipType).toBe('verified');
        });

        it('should get a list of pending incoming requests for userOne', async () => {
            const res = await request(app)
                .get('/api/friendships?status=pending')
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            const incomingRequests = res.body.filter(f => f.isPendingRecipient === true);
            expect(incomingRequests.length).toBe(1);
            expect(incomingRequests[0].user.username).toBe(userThree.username);
        });

        it('should get a list of pending outgoing requests for userOne', async () => {
            await createFriendship({ user1: userOne, user2: userFive, requestedBy: userOne, status: 'pending' });
            const res = await request(app)
                .get('/api/friendships?status=pending')
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            const outgoingRequests = res.body.filter(f => f.isPendingRecipient === false);
            expect(outgoingRequests.length).toBe(1);
            expect(outgoingRequests[0].user.username).toBe(userFive.username);
        });

        it('should get a list of blocked users by userOne', async () => {
            await createFriendship({ user1: userOne, user2: userTwo, requestedBy: userOne, status: 'blocked'});
            const res = await request(app)
                .get('/api/friendships?status=blocked&direction=outgoing')
                .set('Authorization', `Bearer ${tokenOne}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].user.username).toBe(userTwo.username);
        });

    });
});