const express = require('express');
const multer = require('multer');
const {
  stats, listUsers, listPrompts,
  bulkUploadUsers, deleteUser, resetUserPassword,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

const router = express.Router();

// File upload buffer for Excel/CSV — capped at 2 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(protect, adminOnly);

router.get('/stats', stats);
router.get('/users', listUsers);
router.post('/users/bulk-upload', upload.single('file'), bulkUploadUsers);
router.post('/users/:id/reset-password', resetUserPassword);
router.delete('/users/:id', deleteUser);
router.get('/prompts', listPrompts);

module.exports = router;
