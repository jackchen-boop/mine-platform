import { Router } from 'express';
import db from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import pdfParse from 'pdf-parse';
import { evaluateMineProject } from '../lib/mine-evaluation.js';
import { callExternalLLM } from '../lib/ai-provider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '../../public/uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

// 归档存储目录：/data/archive/{年}/{月}/{日}/{category}/
const archiveBase = process.env.DATA_DIR || join(__dirname, '../../data');
const archiveDir = join(archiveBase, 'archive');
if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

function getArchivePath(category) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const cat = category || 'other';
  const dir = join(archiveDir, String(y), m, d, cat);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// 修复 multer 中文文件名乱码（默认 latin1 → utf8）
function fixFilename(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch { return name; }
}

// 从PDF文件中提取文本
async function extractPdfText(filePath) {
  try {
    const buffer = readFileSync(filePath);
    const pdfData = await pdfParse(buffer, { max: 20 });
    return pdfData.text;
  } catch (e) {
    return null;
  }
}

// 从文本中提取矿区地址和矿名信息（增强版：同时提取品位、储量、矿种等）
function extractMineInfoFromText(text) {
  if (!text) return { province: '', city: '', mineName: '', projectName: '' };

  // 截取前8000字进行分析（地址信息通常在报告前部）
  const sample = text.substring(0, 8000);

  const provinces = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','台湾','内蒙古','广西','西藏','宁夏','新疆','香港','澳门'];

  // 找省份
  let province = '';
  for (const p of provinces) {
    if (sample.includes(p) || text.includes(p)) {
      province = p;
      break;
    }
  }

  // 找市/州
  let city = '';
  const cityAfterProvince = sample.match(/(?:省|自治区)\s*([\u4e00-\u9fa5]{2,8}(?:市|州|县))/);
  if (cityAfterProvince) {
    city = cityAfterProvince[1];
  } else {
    const cityMatch = sample.match(/(?:^|[^\u4e00-\u9fa5])([\u4e00-\u9fa5]{2,8}(?:市|州|县))/);
    if (cityMatch) city = cityMatch[1];
  }

  // 矿种后缀列表
  const mineralSuffixes = '金矿|银矿|铜矿|铅锌矿|铅矿|锌矿|铁矿|煤矿|钨矿|锡矿|钼矿|镍矿|钴矿|锂矿|稀土矿|多金属矿|有色金属矿|贵金属矿';

  // 找矿名
  let mineName = '';
  const minePatterns = [
    new RegExp(`(?:^|[^\\u4e00-\\u9fa5])([\\u4e00-\\u9fa5]{1,14}(?:${mineralSuffixes}))`),
    new RegExp(`(?:区|县|镇|乡)\\s*([\\u4e00-\\u9fa5]{1,14}(?:${mineralSuffixes}))`),
    /(?:^|[^\u4e00-\u9fa5])([\u4e00-\u9fa5]{1,14}(?:矿区|矿山))/,
    /(?:位于|地处|在)\s*([\u4e00-\u9fa5]{1,14}(?:山|岭|峰|沟|谷|川))/,
  ];

  for (const pattern of minePatterns) {
    const match = sample.match(pattern);
    if (match) {
      mineName = match[1];
      break;
    }
  }

  // 清理矿名
  if (mineName && province) {
    for (const p of provinces) {
      if (mineName.startsWith(p) && mineName.length > p.length) {
        mineName = mineName.substring(p.length);
        break;
      }
    }
  }
  if (mineName && mineName.startsWith('省')) {
    mineName = mineName.substring(1);
  }

  // 组合项目名
  let projectName = '';
  if (province && mineName) {
    projectName = city ? `${province}${city}${mineName}` : `${province}${mineName}`;
  } else if (province && city) {
    projectName = `${province}${city}矿区`;
  } else if (province) {
    projectName = `${province}矿区项目`;
  } else if (mineName) {
    projectName = mineName;
  }

  // ---- 增强提取：品位、储量、矿种、面积、矿山类型 ----

  // 提取矿种
  let mineralTypes = '';
  const mineralMap = { '金矿': 'gold', '银矿': 'silver', '铜矿': 'copper', '铅锌矿': 'lead,zinc', '铁矿': 'iron', '煤矿': 'coal', '多金属矿': 'copper,gold,silver' };
  for (const [cn, en] of Object.entries(mineralMap)) {
    if (text.includes(cn)) { mineralTypes = en; break; }
  }

  // 提取品位 - 优先匹配 g/t
  let reserveGrade = '';
  const gradeMatch = text.match(/(?:品位|平均品位)[^]*?([\d.]+)\s*(?:g\/t|克\/吨)/i);
  if (gradeMatch) reserveGrade = gradeMatch[1] + ' g/t';

  // 提取储量 - 优先匹配金属量
  let estimatedReserve = '';
  const metalMatch = text.match(/(?:金属量|金金属量|Au)[^]*?([\d.]+)\s*吨/);
  if (metalMatch) {
    estimatedReserve = metalMatch[1] + '吨';
  } else {
    const oreMatch = text.match(/(?:矿石量|资源量|保有资源量)[^]*?([\d.]+)\s*万吨/);
    if (oreMatch) estimatedReserve = oreMatch[1] + '万吨';
  }

  // 提取面积
  let areaKm2 = 0;
  const areaMatch = text.match(/([\d.]+)\s*(?:km2|km²|平方千米|平方公里)/i);
  if (areaMatch) areaKm2 = parseFloat(areaMatch[1]);

  // 提取矿山类型
  let mineType = 'underground';
  if (/露天|open[\s-]?pit/i.test(text)) mineType = 'open-pit';
  else if (/联合|combined/i.test(text)) mineType = 'combined';

  return {
    province, city, mineName, projectName,
    mineralTypes, reserveGrade, estimatedReserve, areaKm2, mineType
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.report_type || req.body.report_category || 'other';
    const dest = getArchivePath(category);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const originalName = fixFilename(file.originalname);
    const ext = originalName.split('.').pop();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const uid = req.user ? req.user.id : 0;
    cb(null, `${ts}_uid${uid}_${randomUUID().slice(0, 8)}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.jpg', '.png', '.csv'];
    const originalName = fixFilename(file.originalname);
    const ext = '.' + originalName.split('.').pop().toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的文件格式，允许：' + allowed.join(', ')));
  }
});

const router = Router();

// 辅助函数：创建新项目（自动关联用户所属工作组）
function createDefaultTasks(projectId, userId) {
  const DEFAULT_TASKS = [
    { phase: 'info_collection',    title: '收集项目基础信息及联系方式' },
    { phase: 'due_diligence',      title: '审查地质报告及证照资料' },
    { phase: 'ai_evaluation',      title: 'AI智能评价分析' },
    { phase: 'report_preparation', title: '整理并上传完整项目材料' },
    { phase: 'listing',            title: '完成项目挂牌发布' },
    { phase: 'investor_matching',  title: '匹配目标投资机构' },
    { phase: 'roadshow',           title: '安排路演推介' },
    { phase: 'negotiation',        title: '推进价格及条款谈判' },
    { phase: 'deal_closing',       title: '完成协议签署与交割' },
  ];
  const stmt = db.prepare(
    `INSERT INTO project_tasks (project_id, phase, title, status, priority, created_by, created_at)
     VALUES (?, ?, ?, 'pending', 'normal', ?, datetime('now'))`
  );
  for (const t of DEFAULT_TASKS) {
    stmt.run(projectId, t.phase, t.title, userId);
  }
}

function createProjectFromUpload(userId, projectName) {
  const code = `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  // 获取用户所属的第一个工作组
  const userWg = db.prepare('SELECT workgroup_id FROM workgroup_members WHERE user_id = ? LIMIT 1').get(userId);
  const workgroupId = userWg ? userWg.workgroup_id : null;

  const result = db.prepare(`
    INSERT INTO mine_projects (code, name, mineral_types, owner_id, workgroup_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
  `).run(code, projectName.trim(), 'unknown', userId, workgroupId);
  const projectId = result.lastInsertRowid;
  createDefaultTasks(projectId, userId);
  return projectId;
}

// 辅助函数：解析PDF文本并生成AI分析
async function analyzeUploadedFile(filePath, fileType, projectId, userId, preExtractedText = null) {
  const analysisResult = {
    extractedText: null,
    aiAnalysis: null,
    textLength: 0,
    meetsRequirements: false,
    missingItems: []
  };

  // 只解析PDF文件
  if (!fileType.includes('pdf')) {
    analysisResult.missingItems.push('当前仅支持PDF文件的AI自动分析，其他格式请手动输入关键数据');
    return analysisResult;
  }

  let pdfText = preExtractedText;

  try {
    if (!pdfText) {
      const buffer = readFileSync(filePath);
      const pdfData = await pdfParse(buffer, { max: 20 }); // 解析前20页
      pdfText = pdfData.text;
    }

    if (!pdfText) {
      analysisResult.missingItems.push('无法读取PDF文本内容，可能是扫描版PDF');
      return analysisResult;
    }

    analysisResult.extractedText = pdfText;
    analysisResult.textLength = pdfText.length;

    // 检查文本长度是否满足分析要求
    if (pdfText.length < 200) {
      analysisResult.missingItems.push('PDF文本内容过少（<200字），可能是扫描版PDF，建议上传可搜索的PDF或手动输入关键数据');
      return analysisResult;
    }

    // 从PDF文本中提取结构化信息构造项目对象（用于AI分析和本地降级评分）
    const mineInfo = extractMineInfoFromText(pdfText);
    // 构造评价引擎能识别的储量格式：包含矿石量和金属量
    let formattedReserve = '';
    const oreTonsMatch = pdfText.match(/(?:矿石量|资源量|保有资源量)[^]*?([\d.]+)\s*万吨/);
    if (oreTonsMatch) formattedReserve += '资源量' + oreTonsMatch[1] + '万吨 ';
    if (mineInfo.mineralTypes === 'gold' && mineInfo.estimatedReserve) {
      formattedReserve += 'Au ' + mineInfo.estimatedReserve;
    } else if (mineInfo.mineralTypes === 'copper' && mineInfo.estimatedReserve) {
      formattedReserve += 'Cu ' + mineInfo.estimatedReserve;
    } else if (mineInfo.estimatedReserve) {
      formattedReserve += mineInfo.estimatedReserve;
    }
    // 构造评价引擎能识别的品位格式：带Au/Cu前缀
    let formattedGrade = mineInfo.reserveGrade || '';
    if (mineInfo.mineralTypes === 'gold' && formattedGrade) {
      formattedGrade = 'Au ' + formattedGrade;
    } else if (mineInfo.mineralTypes === 'copper' && formattedGrade) {
      formattedGrade = 'Cu ' + formattedGrade;
    }
    const mockProject = {
      development_stage: 'detailed-exploration',
      mineral_types: mineInfo.mineralTypes || 'gold',
      estimated_reserve: formattedReserve.trim(),
      reserve_grade: formattedGrade.trim(),
      description: pdfText.substring(0, 8000),
      mine_type: mineInfo.mineType || 'underground',
      area_km2: mineInfo.areaKm2 || 0,
      province: mineInfo.province || '',
      city: mineInfo.city || '',
      license_expires: null,
    };

    const llmResult = await callExternalLLM(mockProject, pdfText);
    const aiAnalysis = llmResult.result;
    analysisResult.aiAnalysis = aiAnalysis;
    analysisResult.meetsRequirements = true;

    // 保存AI分析结果到数据库
    if (projectId) {
      db.prepare(`
        INSERT INTO ai_analyses (user_id, project_id, analysis_type, content, ai_score, model_used, token_usage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        projectId,
        'report_analysis',
        JSON.stringify(aiAnalysis),
        aiAnalysis.overallScore,
        llmResult.model,
        JSON.stringify(llmResult.tokenUsage || { input: pdfText.length, output: JSON.stringify(aiAnalysis).length })
      );
    }
  } catch (e) {
    analysisResult.missingItems.push('PDF解析失败：' + e.message);
  }

  return analysisResult;
}

// POST /api/mine-reports/upload — 文件上传
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    // 修复中文文件名乱码
    req.file.originalname = fixFilename(req.file.originalname);

    const { project_id, report_type, report_category, new_project_name } = req.body;

    let finalProjectId = project_id || null;
    let preExtractedText = null;
    let autoGeneratedProject = false;
    let generatedProjectName = null;

    // 如果没有指定项目，且没有提供新项目名称，尝试从PDF中自动提取矿区信息生成项目
    if (!finalProjectId && (!new_project_name || !new_project_name.trim())) {
      if (req.file.mimetype.includes('pdf')) {
        preExtractedText = await extractPdfText(req.file.path);
        if (preExtractedText) {
          const mineInfo = extractMineInfoFromText(preExtractedText);
          if (mineInfo.projectName) {
            finalProjectId = createProjectFromUpload(req.user.id, mineInfo.projectName);
            autoGeneratedProject = true;
            generatedProjectName = mineInfo.projectName;
          }
        }
      }
      // 如果还是无法生成项目（非PDF或提取失败），创建一个默认项目
      if (!finalProjectId) {
        const defaultName = '未命名矿区-' + new Date().toISOString().slice(0, 10);
        finalProjectId = createProjectFromUpload(req.user.id, defaultName);
        autoGeneratedProject = true;
        generatedProjectName = defaultName;
      }
    }

    // 如果提供了新项目名且没有选中已有项目，则创建新项目
    if (!finalProjectId && new_project_name && new_project_name.trim()) {
      finalProjectId = createProjectFromUpload(req.user.id, new_project_name);
    }

    const category = req.body.report_type || req.body.report_category || 'other';
    const archiveSubPath = req.file.path.replace(archiveDir + '/', '');

    const result = db.prepare(`
      INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')
    `).run(
      req.user.id,
      finalProjectId,
      category,
      req.file.originalname,
      archiveSubPath,
      req.file.size,
      req.file.mimetype
    );

    const reportId = result.lastInsertRowid;

    // 进行AI分析（复用已提取的PDF文本，避免重复解析）
    const analysis = await analyzeUploadedFile(req.file.path, req.file.mimetype, finalProjectId, req.user.id, preExtractedText);

    // 如果有提取到文本，更新报告记录
    if (analysis.extractedText) {
      db.prepare('UPDATE mine_reports SET extracted_text = ?, parse_status = ? WHERE id = ?')
        .run(analysis.extractedText.substring(0, 50000), analysis.meetsRequirements ? 'parsed' : 'parse_failed', reportId);
    }

    res.status(201).json({
      id: reportId,
      filename: req.file.originalname,
      size: req.file.size,
      project_id: finalProjectId,
      ai_analysis: analysis.aiAnalysis,
      meets_requirements: analysis.meetsRequirements,
      missing_items: analysis.missingItems,
      text_length: analysis.textLength,
      has_extracted_text: !!analysis.extractedText,
      auto_generated_project: autoGeneratedProject,
      generated_project_name: generatedProjectName,
      message: analysis.meetsRequirements ? '文件上传成功，已完成AI分析' : '文件上传成功，但AI分析未通过（详见 missing_items）'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-reports/upload-batch — 批量上传
router.post('/upload-batch', requireAuth, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择文件' });

    // 修复中文文件名乱码
    for (const file of req.files) {
      file.originalname = fixFilename(file.originalname);
    }

    const { project_id, report_type, report_category, new_project_name } = req.body;

    let finalProjectId = project_id || null;

    // 如果提供了新项目名且没有选中已有项目，则创建新项目
    if (!finalProjectId && new_project_name && new_project_name.trim()) {
      finalProjectId = createProjectFromUpload(req.user.id, new_project_name);
    }

    const category = req.body.report_type || req.body.report_category || 'other';
    const results = [];

    for (const file of req.files) {
      const archiveSubPath = file.path.replace(archiveDir + '/', '');
      const result = db.prepare(`
        INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded')
      `).run(
        req.user.id,
        finalProjectId,
        category,
        file.originalname,
        archiveSubPath,
        file.size,
        file.mimetype
      );
      results.push({ id: result.lastInsertRowid, filename: file.originalname });

      // 异步分析第一个PDF文件
      if (file.mimetype.includes('pdf')) {
        analyzeUploadedFile(file.path, file.mimetype, finalProjectId, req.user.id).then(analysis => {
          if (analysis.extractedText) {
            db.prepare('UPDATE mine_reports SET extracted_text = ?, parse_status = ? WHERE id = ?')
              .run(analysis.extractedText.substring(0, 50000), analysis.meetsRequirements ? 'parsed' : 'parse_failed', result.lastInsertRowid);
          }
        }).catch(() => {});
      }
    }

    res.status(201).json({ count: results.length, reports: results, project_id: finalProjectId, message: `${results.length}个文件上传成功` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mine-reports — 创建报告记录（无文件）
router.post('/', requireAuth, (req, res) => {
  try {
    const { project_id, report_type, original_filename, stored_filename, file_size, file_type } = req.body;
    if (!original_filename) return res.status(400).json({ error: '文件名必填' });

    const result = db.prepare(`
      INSERT INTO mine_reports (user_id, project_id, report_type, original_filename, stored_filename, file_size, file_type, parse_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, project_id || null, report_type || 'exploration', original_filename, stored_filename || original_filename, file_size || 0, file_type || 'unknown');

    res.status(201).json({ id: result.lastInsertRowid, message: '报告记录已创建' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports — 当前用户的报告列表（含项目信息和初始上传人）
router.get('/', requireAuth, (req, res) => {
  try {
    const reports = db.prepare(`
      SELECT mr.*, mp.name as project_name
      FROM mine_reports mr
      LEFT JOIN mine_projects mp ON mr.project_id = mp.id
      WHERE mr.user_id = ?
      ORDER BY mr.created_at DESC
    `).all(req.user.id);

    // 收集涉及的项目ID，查询每个项目的初始上传人信息
    const projectIds = [...new Set(reports.filter(r => r.project_id).map(r => r.project_id))];
    const projectInfo = {};

    for (const pid of projectIds) {
      const first = db.prepare(`
        SELECT mr.user_id, u.name as uploader_name, wg.name as workgroup_name
        FROM mine_reports mr
        LEFT JOIN users u ON mr.user_id = u.id
        LEFT JOIN workgroup_members wgm ON u.id = wgm.user_id
        LEFT JOIN workgroups wg ON wgm.workgroup_id = wg.id
        WHERE mr.project_id = ?
        ORDER BY mr.id ASC
        LIMIT 1
      `).get(pid);
      if (first) {
        projectInfo[pid] = first;
      }
    }

    res.json({ reports, projectInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports/project/:id — 某项目的报告列表
router.get('/project/:id', requireAuth, (req, res) => {
  try {
    // 权限检查：非管理员只能访问自己所在工作组或自己创建的项目报告
    if (req.user.role !== 'admin') {
      const project = db.prepare('SELECT owner_id, workgroup_id FROM mine_projects WHERE id = ?').get(req.params.id);
      if (!project) return res.status(404).json({ error: '项目不存在' });
      if (project.owner_id !== req.user.id) {
        const inWg = db.prepare('SELECT 1 FROM workgroup_members WHERE workgroup_id = ? AND user_id = ?').get(project.workgroup_id, req.user.id);
        if (!inWg) return res.status(403).json({ error: '无权访问' });
      }
    }
    const reports = db.prepare('SELECT * FROM mine_reports WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mine-reports/:id/download — 下载报告文件（支持 ?token= 参数供直链下载）
router.get('/:id/download', requireAuth, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM mine_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });

    // 权限：本人上传 或 同工作组成员 或 管理员
    if (req.user.role !== 'admin' && report.user_id !== req.user.id) {
      const project = report.project_id
        ? db.prepare('SELECT workgroup_id FROM mine_projects WHERE id = ?').get(report.project_id)
        : null;
      if (project?.workgroup_id) {
        const member = db.prepare(
          'SELECT id FROM workgroup_members WHERE workgroup_id = ? AND user_id = ?'
        ).get(project.workgroup_id, req.user.id);
        if (!member) return res.status(403).json({ error: '无权下载此文件' });
      } else {
        return res.status(403).json({ error: '无权下载此文件' });
      }
    }

    const filePath = join(archiveDir, report.stored_filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

    res.download(filePath, report.original_filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mine-reports/:id — 删除报告
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM mine_reports WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!report) return res.status(404).json({ error: '报告不存在' });
    db.prepare('DELETE FROM mine_reports WHERE id = ?').run(req.params.id);
    res.json({ message: '已删除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 错误处理中间件
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制（最大100MB）' });
  }
  if (err.message && err.message.includes('不支持的文件格式')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message || '上传失败' });
});

// PUT /api/mine-reports/link-project — 批量更新报告关联的项目
router.put('/link-project', requireAuth, (req, res) => {
  try {
    const { report_ids, project_id } = req.body;
    if (!report_ids || !Array.isArray(report_ids) || report_ids.length === 0) {
      return res.status(400).json({ error: '请提供报告ID列表' });
    }
    if (!project_id) {
      return res.status(400).json({ error: '请提供项目ID' });
    }

    // 验证项目存在
    const project = db.prepare('SELECT id FROM mine_projects WHERE id = ? AND status = ?').get(project_id, 'active');
    if (!project) return res.status(404).json({ error: '项目不存在' });

    // 批量更新报告的项目关联（admin可关联任何报告，普通用户只能关联自己的）
    const placeholders = report_ids.map(() => '?').join(',');
    let result;
    if (req.user.role === 'admin') {
      result = db.prepare(
        `UPDATE mine_reports SET project_id = ? WHERE id IN (${placeholders})`
      ).run(project_id, ...report_ids);
    } else {
      result = db.prepare(
        `UPDATE mine_reports SET project_id = ? WHERE id IN (${placeholders}) AND user_id = ?`
      ).run(project_id, ...report_ids, req.user.id);
    }

    res.json({ success: true, updated: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
