const router = require('express').Router();
const ctrl = require('../controllers/stonkbot.controller');
const { authenticate } = require('../middleware/auth');
const requireSuperadmin = require('../middleware/requireSuperadmin');

router.use(authenticate);

router.get('/status', ctrl.getStatus);
router.get('/account', ctrl.getAccount);
router.get('/positions', ctrl.getPositions);
router.get('/trades', ctrl.getTrades);
router.get('/pnl', ctrl.getPnl);
router.get('/signals', ctrl.getSignals);
router.get('/config', ctrl.getConfig);
router.post('/control', requireSuperadmin, ctrl.postControl);

module.exports = router;
