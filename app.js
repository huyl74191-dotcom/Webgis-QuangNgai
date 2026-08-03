// =====================================================
// APP.JS — Điểm khởi động chính của server Express
// =====================================================

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');

const app = express();

// ---- Cấu hình EJS làm view engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // phục vụ css/js/geojson tĩnh

app.use(session({
    secret: process.env.SESSION_SECRET || 'webgis_secret',
    resave: false,
    saveUninitialized: false
}));

// ---- Import các route ----
const indexRoutes = require('./routes/index');
const mapRoutes = require('./routes/mapRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const warningRoutes = require('./routes/warningRoutes');
const reportRoutes = require('./routes/reportRoutes');
const loginRoutes = require("./routes/loginRoutes");
const apiRoutes = require('./routes/apiRoutes');

app.use('/', indexRoutes);
app.use('/map', mapRoutes);
app.use('/monitoring', monitoringRoutes);
app.use('/statistics', statisticsRoutes);
app.use('/warning', warningRoutes);
app.use('/report', reportRoutes);
app.use("/login", loginRoutes);
app.use('/api', apiRoutes);

// ---- Khởi động server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});