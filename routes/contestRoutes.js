const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');
const {
  listContests,
  createContest,
  updateContest,
  deleteContest,
  uploadAllowedEmails,
  publishContest,
  closeContest,
  getContestDetail,
} = require('../controllers/contestAdminController');
const {
  listAvailable,
  getContestForUser,
  startContest,
  submitContest,
  getMyResult,
  leaderboard,
  getContestLeaderboard,
} = require('../controllers/contestUserController');

const router = express.Router();

// File upload buffer for Excel/CSV — capped at 2 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ----- Admin endpoints (/api/admin/contests) — mounted by server.js below.
const adminRouter = express.Router();
adminRouter.use(protect, adminOnly);
adminRouter.get('/',            listContests);
adminRouter.post('/',           createContest);
adminRouter.get('/:id',         getContestDetail);
adminRouter.put('/:id',         updateContest);
adminRouter.delete('/:id',      deleteContest);
adminRouter.post('/:id/emails', upload.single('file'), uploadAllowedEmails);
adminRouter.post('/:id/publish', publishContest);
adminRouter.post('/:id/close',   closeContest);

// ----- User endpoints (/api/contests)
router.use(protect);
// `/leaderboard` must come BEFORE the catch-all `/:id` so it isn't matched
// as a Contest id.
router.get('/leaderboard',          leaderboard);
router.get('/',                     listAvailable);
router.get('/:id/leaderboard',      getContestLeaderboard);
router.get('/:id/result',           getMyResult);
router.get('/:id',                  getContestForUser);
router.post('/:id/start',           startContest);
router.post('/:id/submit',          submitContest);

module.exports = { userRouter: router, adminRouter };
