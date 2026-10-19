const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render("warning", {
        title: "Cảnh báo",
        activePage: "warning",
        sharedScripts: ["water-quality-rules.js"],
        pageScript: "warning.js"
    });
});

module.exports = router;