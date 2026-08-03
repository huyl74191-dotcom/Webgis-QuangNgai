const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render("report", {
        title: "Báo cáo",
        activePage: "report",
        pageScript: "report.js"
    });
});

module.exports = router;