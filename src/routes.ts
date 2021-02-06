import express from "express";
import { User } from "./entity/User";
import { DbUtils } from "./utils/DbUtils";

const router = express.Router();

/**
 * Test API for Checking if Server is up
 */
router.get('/', async (req, res) => {
    console.log(req.hostname);
    res.send(`The Server is up on ${req.hostname}!!`);
});

/**
 * API to get a User from email_id
 */
router.get('/user/:email', async (req, res) => {
    console.log('GET /api/user/:email API call made');

    try {
        const connection = await DbUtils.getConnection();
        const user = await connection.manager.findOne(User, { where: { email_id: req.params.email } });
        if(user) {
            return res.status(200).json(user);
        }

        return res.status(400).json({ message: 'User does not exists' });   
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * API to Create a new User
 */
router.post('/user', async (req, res) => {
    console.log('POST /api/user API call made');

    const { email_id, user_name, phone_no, gender, coins, image } = req.body;
    if(!email_id) {
        return res.status(400).json({ message: 'Email must be provide' });
    }

    try {
        const connection = await DbUtils.getConnection();
        const exists = await connection.manager.findOne(User, { where: { email_id } });
        if(exists) {
            return res.status(409).json({ message: 'The Email has been taken, please try another'});
        }

        const user = new User();
        user.email_id = email_id;
        user.user_name = user_name;
        user.phone_no = phone_no;
        user.gender = gender;
        user.coins = coins;
        user.image = image;
        await connection.manager.save(user);
        res.status(200).json({ message: 'User created successfully' });   
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * Update a User from email_id
 */
router.put('/user', async (req, res) => {
    console.log('PUT /api/user API call made');

    const { email_id, user_name, phone_no, gender, coins, image } = req.body;
    if(!email_id) {
        return res.status(400).json({ message: 'Email must be provide' });
    }

    try {
        const connection = await DbUtils.getConnection();
        const exists = await connection.manager.findOne(User, { where: { email_id } });
        if(!exists) {
            return res.status(409).json({ message: 'The Email is not registered with us, please try another'});
        }

        exists.email_id = email_id;
        exists.user_name = user_name;
        exists.phone_no = phone_no;
        exists.gender = gender;
        exists.coins = coins;
        exists.image = image;
        await connection.manager.save(exists);
        res.status(200).json({ message: 'User updated successfully' });   
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/**
 * Add coins for a User from email_id
 */
router.put('/user/:email', async (req, res) => {
    console.log('PUT /api/user/:email API call made');

    const { coins } = req.body;
    if(!req.params.email) {
        return res.status(400).json({ message: 'Email must be provide' });
    }

    try {
        const connection = await DbUtils.getConnection();
        const exists = await connection.manager.findOne(User, { where: { email_id: req.params.email } });
        if(!exists) {
            return res.status(409).json({ message: 'The Email is not registered with us, please try another'});
        }

        exists.coins += coins;
        await connection.manager.save(exists);
        res.status(200).json({ message: 'User coins updated successfully' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

module.exports = router;