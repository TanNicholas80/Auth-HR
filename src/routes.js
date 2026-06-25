const express = require('express');
const authRoutes = require('./modules/auths/auth.routes');
const departmentRoutes   = require('./modules/departments/department.route');
const documentRoutes   = require('./modules/documents/document.routes');
// tambah route lain di sini, contoh:
//const employeesRoutes   = require('./employeesRoutes');


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/documents', documentRoutes);

module.exports = router;