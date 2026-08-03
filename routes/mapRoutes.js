const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('map', {
        title: 'Bản đồ',
        activePage: 'map',
        pageScript: 'map.js'
    });
});

module.exports = router;