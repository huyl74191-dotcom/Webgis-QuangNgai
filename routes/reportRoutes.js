const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render("report", {
        title: "Báo cáo",
        activePage: "report",
        sharedScripts: ["water-quality-rules.js"],
        pageScript: "report.js"
    });
});

module.exports = router;