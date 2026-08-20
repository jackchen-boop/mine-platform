#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成香港保诚重疾险与国内三大保险公司重疾险对比分析报告（Word）"""

from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from datetime import datetime
import os


def set_cell_shading(cell, fill):
    """设置单元格背景色"""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    tcPr.append(shd)


def set_cell_border(cell, **kwargs):
    """设置单元格边框"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = 'w:{}'.format(edge)
            element = OxmlElement(tag)
            element.set(qn('w:val'), 'single')
            element.set(qn('w:sz'), str(edge_data.get('sz', 4)))
            element.set(qn('w:space'), '0')
            element.set(qn('w:color'), edge_data.get('color', '000000'))
            tcBorders.append(element)
    tcPr.append(tcBorders)


def add_heading_zh(doc, text, level=1):
    """添加中文标题"""
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        run.font.name = 'Microsoft YaHei'
        run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    return p


def add_paragraph_zh(doc, text, bold=False, size=10.5, align='left'):
    """添加中文段落"""
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = 'Microsoft YaHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    run.font.size = Pt(size)
    run.font.bold = bold
    if align == 'center':
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == 'right':
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    return p


def add_table_zh(doc, rows, cols, data, header_fill='1F4E79'):
    """添加中文表格"""
    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for i, row_data in enumerate(data):
        row = table.rows[i]
        for j, cell_text in enumerate(row_data):
            cell = row.cells[j]
            cell.text = str(cell_text)
            # 设置字体
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.name = 'Microsoft YaHei'
                    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
                    run.font.size = Pt(9)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if i == 0:
                set_cell_shading(cell, header_fill)
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.font.bold = True
                        run.font.color.rgb = RGBColor(255, 255, 255)
    return table


def main():
    doc = Document()

    # 设置默认中文字体
    style = doc.styles['Normal']
    style.font.name = 'Microsoft YaHei'
    style._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    style.font.size = Pt(10.5)

    # 封面
    doc.add_paragraph()
    doc.add_paragraph()
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('香港保诚重疾险与内地三大保险公司\n重疾险产品对比分析报告')
    run.font.name = 'Microsoft YaHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor(31, 78, 121)

    doc.add_paragraph()
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run('产品范围：香港保诚 CIM3/BCIM3（诚保一生）\n对比对象：中国人寿康宁尊享、中国太保蓝鲸1号、中国平安盛世福')
    run.font.name = 'Microsoft YaHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    run.font.size = Pt(12)
    run.font.color.rgb = RGBColor(89, 89, 89)

    doc.add_paragraph()
    doc.add_paragraph()
    date_p = doc.add_paragraph()
    date_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = date_p.add_run(f'报告日期：{datetime.now().strftime("%Y年%m月%d日")}')
    run.font.name = 'Microsoft YaHei'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    run.font.size = Pt(11)

    doc.add_page_break()

    # 报告摘要
    add_heading_zh(doc, '报告摘要', level=1)
    add_paragraph_zh(doc,
        '本报告针对香港保诚「诚保一生」危疾保（CIM3/BCIM3）与内地三大保险公司（中国人寿、'
        '中国太保、中国平安）当前主力重疾险产品进行系统性对比。对比维度涵盖保障范围、赔付设计、'
        '特色责任、价格水平、理赔便利性、医院要求及适合人群。')
    add_paragraph_zh(doc,
        '核心结论：保诚产品在疾病定义宽松度、多次赔付总额、储蓄分红潜力方面具有明显优势，'
        '更适合有美元资产配置需求、追求长期高杠杆保障的客户；内地产品在理赔便利性、医院范围、'
        '本地服务响应方面更优，适合看重即时赔付体验和人民币保单确定性的客户。')

    # 一、产品概览
    add_heading_zh(doc, '一、产品概览', level=1)
    add_paragraph_zh(doc, '表1 参与对比的产品基本信息', bold=True)

    table_data = [
        ['产品名称', '保险公司', '产品定位', '重疾种类', '核心卖点'],
        ['诚保一生 CIM3/BCIM3', '香港保诚', '香港分红型终身危疾险', '56种严重疾病+127种病况', '多次赔付可达保额1000%、老年疾病年金、美元资产配置'],
        ['康宁尊享 2024/2025', '中国人寿', '内地终身重疾险', '120种重疾', '品牌网点多、可选重疾多次赔、现金价值高'],
        ['蓝鲸1号终身重疾险 2026', '中国太保', '互联网终身重疾险', '120种重疾', '可选重疾2-3次赔、55岁后额外赔30%、ICU关爱金'],
        ['盛世福 2025', '中国平安', '内地终身重疾险', '120种重疾', '运动涨保额、平安RUN健康管理、15种少儿特疾']
    ]
    add_table_zh(doc, 5, 5, table_data)

    # 二、核心维度对比
    add_heading_zh(doc, '二、核心维度对比', level=1)

    add_paragraph_zh(doc, '表2 基础保障责任对比', bold=True)
    table_data = [
        ['对比维度', '保诚 CIM3/BCIM3', '国寿康宁尊享', '太保蓝鲸1号', '平安盛世福'],
        ['重疾赔付', '首次100%保额；癌症/心脏病/中风等可多次赔付，总额最高达保额1000%', '单次100%（可选分组6组额外5次）', '单次100%（可选不分组2-3次，第二次120%）', '单次100%'],
        ['中症保障', '早期严重疾病/深切治疗等分层赔付', '20种中症，2次，每次50%（可选）', '20种中症，2次，每次60%', '20种中症，1次，50%'],
        ['轻症保障', '部分早期病况按轻症定义赔付', '40种轻症，6次，每次20%（可选）', '40/50种轻症，3次，每次30%', '40种轻症，最多6次'],
        ['少儿特疾', '提供母婴版BCIM3，孕期可投保', '15种少儿特疾额外100%', '可选少儿特疾', '15种少儿特疾'],
        ['特色责任', '老年疾病年金（脑退化/柏金逊每年6%）、危疾后人寿延伸', '癌症单独分组、投保人豁免', '55岁后重疾额外30%、ICU住院关爱金', '运动达标涨保额、健康管理服务'],
        ['币种', '美元/港币', '人民币', '人民币', '人民币'],
        ['分红类型', '非保证分红，保额可增长', '固定保额（部分分红型除外）', '固定保额', '固定保额']
    ]
    add_table_zh(doc, 8, 5, table_data)

    add_paragraph_zh(doc, '表3 理赔与医院要求对比', bold=True)
    table_data = [
        ['对比维度', '保诚 CIM3/BCIM3', '国寿康宁尊享', '太保蓝鲸1号', '平安盛世福'],
        ['内地医院要求', '需在三级医院或15个指定城市二级医院/指定名单医院', '二级及以上公立医院通常即可', '二级及以上公立医院通常即可', '二级及以上公立医院通常即可'],
        ['医生要求', '理赔申请书第二部分须由主诊医生填写', '按内地理赔流程，通常无需医生填写专门表格', '按内地理赔流程', '按内地理赔流程'],
        ['理赔地点', '材料寄送香港，审核周期相对较长', '内地APP/线上理赔，流程快', '内地APP/线上理赔，流程快', '内地APP/线上理赔，流程快'],
        ['疾病定义', '相对宽松（如中风不要求180天后遗留障碍）', '遵循内地重疾定义规范，相对严格', '遵循内地重疾定义规范', '遵循内地重疾定义规范'],
        ['健康告知', '严格/无限告知，投保前就诊记录影响大', '有限告知，按问卷回答', '有限告知，按问卷回答', '有限告知，按问卷回答']
    ]
    add_table_zh(doc, 6, 5, table_data)

    # 三、不同场景下的保单保障
    add_heading_zh(doc, '三、不同场景下的保单保障分析', level=1)

    add_paragraph_zh(doc, '表4 典型理赔场景下的给付差异（以30岁男性、50万保额为例）', bold=True)
    table_data = [
        ['理赔场景', '保诚 CIM3/BCIM3', '国寿康宁尊享', '太保蓝鲸1号', '平安盛世福'],
        ['首次确诊癌症', '赔付50万，保单继续有效（多重危疾保障启动）', '赔付50万，基础保单终止（未选多次赔）', '赔付50万，可选继续有效', '赔付50万，保单终止'],
        ['3年后癌症复发/转移', '可再次赔付，最高累计癌症赔付可达200%保额（100万）', '基础责任不赔；若选多次赔需跨组', '若选二次重疾可赔60万（其他重疾120%）', '不赔'],
        ['确诊急性心梗后1年脑中风', '可分别按心脏病、脑部疾病各赔付，累计可达高额', '若选多次赔且分在不同组可赔', '若选二次重疾可赔60万', '不赔'],
        ['60岁后确诊脑退化/柏金逊', '确诊1年后每年给付6%保额（3万/年），终身', '不额外给付', '不额外给付', '不额外给付'],
        ['确诊轻症（如原位癌）', '按早期病况赔付部分保额', '赔付10万（20%×50万）', '赔付15万（30%×50万）', '按合同约定比例赔付'],
        ['未理赔身故', '赔付保额+分红累积（非保证）', '赔付max（保额，1.05×保费，现金价值）', '按所选方案赔付保费或保额', '赔付保额']
    ]
    add_table_zh(doc, 7, 5, table_data)

    add_heading_zh(doc, '3.1 高杠杆多次赔付场景', level=2)
    add_paragraph_zh(doc,
        '保诚 CIM3/BCIM3 在多次赔付设计上最为激进：癌症、心脏病发作、中风各最高可赔付200%保额，'
        '其他严重疾病及器官疾病也有较高多次赔付空间，总额理论上可达保额1000%。这对有家族病史、'
        '担忧多次重疾发生的客户具有显著吸引力。')

    add_heading_zh(doc, '3.2 早期干预场景', level=2)
    add_paragraph_zh(doc,
        '内地产品在轻症/中症赔付比例上更高：太保蓝鲸1号轻症30%、中症60%均优于国寿康宁尊享的'
        '20%/50%。这意味着在疾病早期阶段，内地产品能提供更高比例的现金流，帮助客户及时治疗。')

    add_heading_zh(doc, '3.3 养老与长期护理场景', level=2)
    add_paragraph_zh(doc,
        '保诚独有的「老年疾病终身年金」在确诊严重脑退化症或柏金逊病1年后，每年支付基本保额6%，'
        '直至身故。这一设计将重疾险与长期护理需求结合，对长寿风险较高的客户极具价值。')

    # 四、保诚内地医院理赔要求
    add_heading_zh(doc, '四、保诚重疾险内地医院理赔要求', level=1)
    add_paragraph_zh(doc,
        '根据保诚香港官网披露，在内地就医申请危疾理赔时，需满足以下条件：')
    add_paragraph_zh(doc,
        '1. 医院等级：原则上须在内地三级医院；或在15个指定城市的二级医院；或在保诚「中华人民共和国选定医院名单」内医院。')
    add_paragraph_zh(doc,
        '2. 指定15个城市：北京、上海、广州、深圳、成都、重庆、杭州、武汉、苏州、西安、南京、长沙、天津、郑州、东莞。')
    add_paragraph_zh(doc,
        '3. 医生要求：理赔申请书第二部分必须由主诊医生填写，客户需先自行支付医生填表费用；符合公司规定者可酌情免除。')
    add_paragraph_zh(doc,
        '4. 资格核实：保诚会在审核理赔申请时核实该医院资格，建议就医前通过保诚官网或国家卫健委网站查询医院等级。')
    add_paragraph_zh(doc,
        '5. 对比提示：内地重疾险通常只需二级及以上公立医院即可理赔，医院范围更广、流程更简化。')

    # 五、适合人群分析
    add_heading_zh(doc, '五、适合人群分析', level=1)

    add_paragraph_zh(doc, '表5 产品适合人群匹配', bold=True)
    table_data = [
        ['产品', '最适合人群', '不太适合人群'],
        ['保诚 CIM3/BCIM3', '有美元资产配置需求；追求多次高杠杆保障；能接受香港理赔流程；健康状况良好；有海外就医或子女留学规划', '预算有限；追求理赔便利；健康状况复杂；无法赴港签约或维护保单'],
        ['国寿康宁尊享', '看重品牌与线下服务；偏好稳健现金价值；需要可选重疾多次赔；给孩子投保', '追求高性价比；希望轻症赔付比例高'],
        ['太保蓝鲸1号', '年轻家庭；预算有限但希望保额充足；看重互联网投保便利；需要55岁后额外保障', '需要强大线下代理人服务；偏好大品牌溢价'],
        ['平安盛世福', '平安老客户；重视健康管理与运动激励；需要少儿特疾保障', '追求极致性价比；需要多次重疾保障']
    ]
    add_table_zh(doc, 5, 3, table_data)

    # 六、投保建议与风险提示
    add_heading_zh(doc, '六、投保建议与风险提示', level=1)

    add_heading_zh(doc, '6.1 投保建议', level=2)
    add_paragraph_zh(doc,
        '1. 如果客户的核心诉求是「多次重疾高杠杆 + 美元资产 + 长寿护理」，优先考虑保诚 CIM3/BCIM3。')
    add_paragraph_zh(doc,
        '2. 如果客户更看重「理赔确定性 + 医院范围广 + 人民币保单」，优先选择内地头部保司产品。')
    add_paragraph_zh(doc,
        '3. 预算有限时，太保蓝鲸1号在轻中症比例和可选责任灵活性上更具性价比。')
    add_paragraph_zh(doc,
        '4. 已有内地重疾险的客户，可将保诚产品作为「海外保障 + 美元资产」补充，而非完全替代。')

    add_heading_zh(doc, '6.2 风险提示', level=2)
    add_paragraph_zh(doc,
        '1. 汇率风险：美元/港币保单受汇率波动影响，未来红利和退保价值以保单货币计价。')
    add_paragraph_zh(doc,
        '2. 分红不确定性：保诚产品的非保证红利取决于保险公司投资表现，实际收益可能低于演示。')
    add_paragraph_zh(doc,
        '3. 理赔时效：香港保险理赔周期通常长于内地，且需邮寄材料、医生配合填表。')
    add_paragraph_zh(doc,
        '4. 法律适用：香港保单受香港法律管辖，纠纷需在香港解决，维权成本较高。')
    add_paragraph_zh(doc,
        '5. 健康告知：香港保险通常执行更严格的无限告知，投保前就诊记录、体检异常均需如实披露。')

    # 附录
    add_heading_zh(doc, '附录：术语解释', level=1)
    add_paragraph_zh(doc, 'CIM3：保诚「诚保一生」危疾保，覆盖严重疾病及早期危疾。')
    add_paragraph_zh(doc, 'BCIM3：诚保一生危疾保—挚爱宝，孕期可投保，保障母婴。')
    add_paragraph_zh(doc, '危疾：即重大疾病，通常包括癌症、急性心梗、脑中风等。')
    add_paragraph_zh(doc, '轻症/中症：重大疾病早期或较轻状态，按合同约定比例赔付。')
    add_paragraph_zh(doc, '保额：保单约定的最高赔付金额。')
    add_paragraph_zh(doc, '现金价值：退保时可领取的金额，长期重疾险通常随时间增长。')

    # 保存
    output_dir = '/Users/cyn/mine-platform/reports'
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, '香港保诚与内地重疾险对比分析报告.docx')
    doc.save(output_path)
    print(f'报告已生成：{output_path}')


if __name__ == '__main__':
    main()
