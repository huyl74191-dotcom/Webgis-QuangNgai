const express = require("express");
const router = express.Router();

// Hiển thị trang đăng nhập
router.get("/", (req, res) => {
    res.render("login", {
        title: "Đăng nhập",
        activePage: "login",
        pageScript: "login.js"
    });
});

module.exports = router;