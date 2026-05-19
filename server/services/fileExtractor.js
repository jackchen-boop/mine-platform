// BP 文件文本提取服务
// 支持 PDF、PPT/PPTX、DOC/DOCX、TXT/MD

import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * 从上传文件中提取文本
 * @param {string} filePath - 文件绝对路径
 * @param {string} mimetype - 文件 MIME 类型
 * @returns {Promise<{ text: string, pageCount: number|null, method: string }>}
 */
export async function extractText(filePath, mimetype) {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf' || mimetype === 'application/pdf') {
    return extractPDF(filePath);
  }

  if (['.txt', '.md'].includes(ext) || mimetype?.startsWith('text/')) {
    return extractPlainText(filePath);
  }

  if (['.pptx', '.ppt'].includes(ext) || mimetype?.includes('presentation')) {
    return extractPPTX(filePath);
  }

  if (['.docx', '.doc'].includes(ext) || mimetype?.includes('wordprocessingml') || mimetype?.includes('msword')) {
    return extractDOCX(filePath);
  }

  return {
    text: '',
    pageCount: null,
    method: 'unsupported',
    message: `${ext} 格式暂不支持自动提取，请在文本框中粘贴 BP 内容`
  };
}

async function extractPDF(filePath) {
  try {
    // 动态导入，避免在不需要时加载
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer, {
      // 限制最大页数，防止超大文件耗尽内存
      max: 50
    });

    const text = data.text?.trim() || '';
    return {
      text: text.slice(0, 80000), // 限制最大文本长度（约 8 万字）
      pageCount: data.numpages,
      method: 'pdf-parse'
    };
  } catch (err) {
    console.error('PDF 解析失败:', err.message);
    return {
      text: '',
      pageCount: null,
      method: 'pdf-parse-failed',
      error: err.message
    };
  }
}

async function extractPlainText(filePath) {
  const buffer = await readFile(filePath);
  const text = buffer.toString('utf-8').trim();
  return {
    text: text.slice(0, 80000),
    pageCount: null,
    method: 'plain-text'
  };
}

/**
 * 从 PPTX 文件中提取文本
 * PPTX 本质是 zip 包，内含 ppt/slides/slideN.xml
 */
async function extractPPTX(filePath) {
  try {
    const { Open } = await import('unzipper');
    const buffer = await readFile(filePath);
    const directory = await Open.buffer(buffer);

    // 查找所有 slide XML 文件
    const slideFiles = directory.files
      .filter(f => f.path.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const na = parseInt(a.path.match(/slide(\d+)/)?.[1] || '0');
        const nb = parseInt(b.path.match(/slide(\d+)/)?.[1] || '0');
        return na - nb;
      });

    if (slideFiles.length === 0) {
      return { text: '', pageCount: 0, method: 'pptx-no-slides' };
    }

    const slideTexts = [];
    for (const slideFile of slideFiles) {
      const xml = await slideFile.buffer();
      const text = parsePPTXXml(xml.toString('utf-8'));
      if (text.trim()) slideTexts.push(text.trim());
    }

    return {
      text: slideTexts.join('\n\n').slice(0, 80000),
      pageCount: slideFiles.length,
      method: 'pptx-extract'
    };
  } catch (err) {
    console.error('PPTX 解析失败:', err.message);
    return { text: '', pageCount: null, method: 'pptx-failed', message: 'PPTX 解析失败，请粘贴文本' };
  }
}

/**
 * 从 DOCX 文件中提取文本
 * DOCX 本质是 zip 包，内含 word/document.xml
 */
async function extractDOCX(filePath) {
  try {
    const { Open } = await import('unzipper');
    const buffer = await readFile(filePath);
    const directory = await Open.buffer(buffer);

    const docFile = directory.files.find(f => f.path === 'word/document.xml');
    if (!docFile) {
      return { text: '', pageCount: null, method: 'docx-no-content' };
    }

    const xml = await docFile.buffer();
    const text = parseDOCXXml(xml.toString('utf-8'));

    return {
      text: text.slice(0, 80000),
      pageCount: null,
      method: 'docx-extract'
    };
  } catch (err) {
    console.error('DOCX 解析失败:', err.message);
    return { text: '', pageCount: null, method: 'docx-failed', message: 'DOCX 解析失败，请粘贴文本' };
  }
}

/**
 * 解析 PPTX slide XML，提取文本内容
 */
function parsePPTXXml(xml) {
  const texts = [];
  const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const t = match[1].trim();
    if (t) texts.push(t);
  }
  return texts.join(' ');
}

/**
 * 解析 DOCX document XML，提取文本内容
 */
function parseDOCXXml(xml) {
  const paragraphs = xml.split(/<\/w:p>/);
  const result = [];
  for (const para of paragraphs) {
    const texts = [];
    const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let match;
    while ((match = regex.exec(para)) !== null) {
      if (match[1]) texts.push(match[1]);
    }
    if (texts.length > 0) result.push(texts.join(''));
  }
  return result.join('\n');
}

/**
 * 生成 AI 解析 BP 的 user prompt
 * @param {string} text - 提取的文本
 * @param {string} fileName - 原始文件名
 */
export function buildBPPrompt(text, fileName) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  return `以下是企业 BP（商业计划书）的内容，文件名：${fileName}

请提取并结构化以下信息（JSON 格式）：
{
  "company_name": "公司名称",
  "sector": "行业/赛道",
  "sub_sector": "细分赛道",
  "stage": "融资阶段（Pre-A/A/A+/B/C 等）",
  "amount_seeking": "本轮拟融资金额",
  "valuation": "投前/投后估值",
  "location": "公司所在城市",
  "founding_year": "成立年份",
  "team": [{"name": "姓名", "role": "职位", "background": "背景简介"}],
  "problem": "解决的核心问题",
  "solution": "产品/解决方案",
  "business_model": "商业模式",
  "traction": "已有牵引数据（营收/用户/合同等）",
  "market_size": "市场规模",
  "competition": "竞争格局/竞争优势",
  "financials": {"revenue": "营收", "growth_rate": "增速", "burn_rate": "月烧"},
  "use_of_funds": "资金用途",
  "summary": "一段话总结（100字以内）",
  "ai_score": 一个 1-100 的整数评分表示项目综合质量
}

如某字段信息不足，值设为 null。

BP 内容：
---
${cleanText.slice(0, 15000)}
---`;
}
