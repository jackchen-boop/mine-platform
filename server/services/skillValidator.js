// 技能信息充分性校验服务
// 调用 MiniMax 非流式 API，判断上传文件是否包含技能所需信息

const MINIMAX_ENDPOINT = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

/**
 * 构造校验 prompt
 * @param {object} skillDef  — SKILL_PROMPTS[key]
 * @param {string} extractedText — 从文件中提取的文本
 * @returns {{ system: string, user: string }}
 */
export function buildValidationPrompt(skillDef, extractedText) {
  const required = (skillDef.requiredInfo || []).filter(f => f.required);
  const optional = (skillDef.requiredInfo || []).filter(f => !f.required);

  const requiredList = required.map(f => `- ${f.label}（必须）`).join('\n');
  const optionalList = optional.length
    ? optional.map(f => `- ${f.label}（可选）`).join('\n')
    : '';

  const system = `你是信息充分性评估专家。
你将收到一份文档内容，以及一项分析任务所需的信息清单。
请判断文档内容是否包含执行该任务所需的核心信息。

【评估规则】
1. 所有"必须"字段都能找到对应信息时，才能判断为 sufficient: true
2. "可选"字段缺失不影响结论，但需列出
3. 仅基于文档内容判断，不做任何推断或假设
4. 输出严格 JSON，不要有任何多余文字

【输出格式（严格 JSON）】
{
  "sufficient": true/false,
  "found": ["已找到的字段label列表"],
  "missing": ["缺失的字段label列表"],
  "summary": "一句话说明文档是否充分"
}`;

  const user = `【分析任务】${skillDef.title}

【必须信息】
${requiredList}
${optionalList ? `【可选信息】\n${optionalList}` : ''}

【文档内容（节选最多3000字）】
${extractedText.slice(0, 3000)}`;

  return { system, user };
}

/**
 * 调用 MiniMax 非流式 API
 * @param {string} system
 * @param {string} user
 * @param {number} timeoutMs — 超时毫秒（默认8000）
 * @returns {string} rawText
 */
export async function runValidation(system, user, timeoutMs = 8000) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY 未配置');

  const usedModel = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

  const payload = {
    model: usedModel,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    max_tokens: 1500
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(MINIMAX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`API 错误 ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();

    // 业务层错误检查
    if (data?.base_resp?.status_code && data.base_resp.status_code !== 0) {
      throw new Error(`API 业务错误 ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
    }

    return data?.choices?.[0]?.message?.content || '';
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * 解析 AI 返回的 JSON 校验结果
 * @param {string} rawText
 * @returns {{ sufficient: boolean, found: string[], missing: string[], summary: string }}
 */
export function parseValidationResult(rawText) {
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('未找到 JSON');
    const parsed = JSON.parse(match[0]);
    return {
      sufficient: Boolean(parsed.sufficient),
      found: Array.isArray(parsed.found) ? parsed.found : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      summary: parsed.summary || ''
    };
  } catch {
    // 解析失败降级：视为充分
    return { sufficient: true, found: [], missing: [], summary: '信息校验解析失败，已跳过' };
  }
}

/**
 * 完整校验流程：根据 uploadId 获取文本 → 构造 prompt → AI 校验 → 解析结果
 * @param {object} db      — better-sqlite3 实例
 * @param {string} uploadId
 * @param {string} skillKey — 已 resolve 的技能 key（如 'pe-vc:尽调清单'）
 * @param {object} skillDef — SKILL_PROMPTS[skillKey]
 * @returns {{ sufficient: boolean, found: string[], missing: string[], summary: string }}
 */
export async function validateSkill(db, uploadId, skillKey, skillDef) {
  // 如果技能没有 requiredInfo，直接通过
  if (!skillDef.requiredInfo || skillDef.requiredInfo.length === 0) {
    return { sufficient: true, found: [], missing: [], summary: '该技能无信息充分性要求' };
  }

  // 获取上传记录
  const row = db.prepare('SELECT extracted_text FROM skill_uploads WHERE id = ?').get(uploadId);
  if (!row || !row.extracted_text) {
    return { sufficient: false, found: [], missing: ['文档内容为空'], summary: '未找到上传文件内容，无法校验' };
  }

  try {
    const { system, user } = buildValidationPrompt(skillDef, row.extracted_text);
    const rawText = await runValidation(system, user, 8000);
    return parseValidationResult(rawText);
  } catch (err) {
    // 超时或 API 错误：降级为 sufficient:true，记录日志
    console.warn(`[skillValidator] 校验失败（降级通过）: ${err.message}`);
    return { sufficient: true, found: [], missing: [], summary: `校验服务暂时不可用，已自动通过（${err.message.slice(0, 60)}）` };
  }
}
