import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../public/uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    cb(null, `${uuidv4()}.${ext}`);
  }
});

const ALLOWED_TYPES = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'txt'];

const multerInstance = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '209715200') },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ALLOWED_TYPES.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型 .${ext}，仅支持：${ALLOWED_TYPES.join(', ')}`));
    }
  }
});

// 单文件上传中间件（字段名 'file'）
export const uploadSingle = (req, res, next) => multerInstance.single('file')(req, res, next);
