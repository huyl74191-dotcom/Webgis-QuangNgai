const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('monitoring', {
        title: 'Quan trắc',
        activePage: 'monitoring',
        pageScript: 'monitoring.js'
    });
});

module.exports = router;