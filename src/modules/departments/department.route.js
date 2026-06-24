const express              = require('express');
const DepartmentController = require('./department.controller');
const authenticate  = require('../../shared/middlewares/authenticate');
const authorize = require('../../shared/middlewares/authorize');

const router = express.Router();

router.get('/',     authenticate,DepartmentController.index);
router.get('/:id',  authenticate,DepartmentController.show);
router.post('/',    authenticate,DepartmentController.create);
router.put('/:id',  authenticate,DepartmentController.update);
router.delete('/:id',authenticate,authorize.roles('SUPER_ADMIN', 'ADMIN'), DepartmentController.delete);

module.exports = router;