const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Bot = require('../models/Bot');
const mongoose = require('mongoose');

// Mock data for testing
const mockBots = [
    {
        _id: 'mock_1',
        name: 'Mock Bot 1',
        type: 'Hotel',
        serviceUrl: 'https://mockbot1.example.com',
        phoneNumber: '+1234567890',
        user: 'mock_user_id',
        assistantId: 'mock_assistant_1',
        deploymentName: 'mockbot1'
    },
    {
        _id: 'mock_2',
        name: 'Mock Bot 2',
        type: 'Hospital',
        serviceUrl: 'https://mockbot2.example.com',
        phoneNumber: '+1234567891',
        user: 'mock_user_id',
        assistantId: 'mock_assistant_2',
        deploymentName: 'mockbot2'
    }
];

// Get all bots for a user
router.get('/bots', protect, async (req, res) => {
    try {
        // If mock user, return mock data
        if (req.user.isMockUser) {
            return res.json(mockBots);
        }

        const bots = await Bot.find({ user: req.user._id });
        res.json(bots);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get a specific bot
router.get('/bots/:id', protect, async (req, res) => {
    try {
        // If mock user, return mock data
        if (req.user.isMockUser) {
            const mockBot = mockBots.find(bot => bot._id === req.params.id);
            if (!mockBot) {
                return res.status(404).json({ message: 'Bot not found' });
            }
            return res.json(mockBot);
        }

        const bot = await Bot.findOne({ 
            _id: req.params.id, 
            user: req.user._id 
        });
        
        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }
        res.json(bot);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add this function at the top of the file
const getBotStatus = async (bot, isMockUser) => {
    if (isMockUser) {
        // Return mock status for mock bots
        return {
            status: 'running',
            lastChecked: new Date().toISOString()
        };
    }

    try {
        // Your existing bot status checking logic
        const status = await Bot.findById(bot._id);
        return status;
    } catch (error) {
        console.error('Error fetching bot status:', error);
        return null;
    }
};

// Update the bot status route
router.get('/bots/:id/status', protect, async (req, res) => {
    try {
        if (req.user.isMockUser) {
            return res.json({
                status: 'running',
                lastChecked: new Date().toISOString()
            });
        }

        // Your existing status checking logic for real bots
        const bot = await Bot.findOne({ 
            _id: req.params.id, 
            user: req.user._id 
        });

        if (!bot) {
            return res.status(404).json({ message: 'Bot not found' });
        }

        const status = await getBotStatus(bot, req.user.isMockUser);
        res.json(status);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
