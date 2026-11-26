import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_equation_box(doc, eq_text, eq_num=None):
    table = doc.add_table(rows=1, cols=2 if eq_num else 1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    if eq_num:
        table.columns[0].width = Inches(5.8)
        table.columns[1].width = Inches(0.8)
        
        cell_eq = table.cell(0, 0)
        p_eq = cell_eq.paragraphs[0]
        p_eq.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_eq.paragraph_format.space_before = Pt(4)
        p_eq.paragraph_format.space_after = Pt(4)
        r = p_eq.add_run(eq_text)
        r.font.name = "Cambria Math"
        r.font.size = Pt(11)
        r.font.italic = True
        
        cell_num = table.cell(0, 1)
        p_num = cell_num.paragraphs[0]
        p_num.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_num.paragraph_format.space_before = Pt(4)
        p_num.paragraph_format.space_after = Pt(4)
        r_num = p_num.add_run(f"({eq_num})")
        r_num.font.name = "Times New Roman"
        r_num.font.size = Pt(10)
        r_num.font.bold = True
        
        set_cell_background(cell_eq, "F8F9FA")
        set_cell_background(cell_num, "F8F9FA")
        set_cell_margins(cell_eq, 80, 80, 120, 120)
        set_cell_margins(cell_num, 80, 80, 60, 60)
    else:
        table.columns[0].width = Inches(6.5)
        cell = table.cell(0, 0)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(eq_text)
        r.font.name = "Cambria Math"
        r.font.size = Pt(11)
        r.font.italic = True
        set_cell_background(cell, "F8F9FA")
        set_cell_margins(cell, 80, 80, 120, 120)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(3)

def add_code_diagram_box(doc, diagram_text, caption_text):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Inches(6.6)
    cell = table.cell(0, 0)
    set_cell_background(cell, "F4F6F8")
    set_cell_margins(cell, 120, 120, 140, 140)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.05
    run = p.add_run(diagram_text)
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(30, 41, 59)
    
    # Caption
    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cap.paragraph_format.space_before = Pt(4)
    p_cap.paragraph_format.space_after = Pt(12)
    r_cap = p_cap.add_run(caption_text)
    r_cap.font.name = "Times New Roman"
    r_cap.font.size = Pt(10.5)
    r_cap.font.bold = True
    r_cap.font.italic = True

def format_table(table, header_bg="1E3A8A", alt_row_bg="F1F5F9"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Format header
    for cell in table.rows[0].cells:
        set_cell_background(cell, header_bg)
        set_cell_margins(cell, 120, 120, 120, 120)
        for p in cell.paragraphs:
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            for run in p.runs:
                run.font.name = "Times New Roman"
                run.font.bold = True
                run.font.size = Pt(10.5)
                run.font.color.rgb = RGBColor(255, 255, 255)
    # Format body
    for i, row in enumerate(table.rows[1:], start=1):
        bg = alt_row_bg if i % 2 == 1 else "FFFFFF"
        for cell in row.cells:
            set_cell_background(cell, bg)
            set_cell_margins(cell, 80, 80, 100, 100)
            for p in cell.paragraphs:
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after = Pt(2)
                for run in p.runs:
                    run.font.name = "Times New Roman"
                    run.font.size = Pt(10)

def main():
    doc = docx.Document()
    
    # Page setup - Margins 1 inch
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
    
    # ------------------ TITLE & COVER PAGE ------------------
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run("A Project Stage-I Report\non")
    r.font.name = "Times New Roman"
    r.font.size = Pt(14)
    r.font.bold = True
    
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(12)
    r = p.add_run("SENTRYFL: DIFFERENTIALLY PRIVATE, COMMUNICATION-EFFICIENT FEDERATED LEARNING FOR TIME-SERIES ANOMALY DETECTION IN DISTRIBUTED SECURITY SENSING")
    r.font.name = "Times New Roman"
    r.font.size = Pt(16)
    r.font.bold = True
    r.font.color.rgb = RGBColor(16, 44, 87)
    
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run("Submitted in Partial fulfillment of requirements for the award of the degree of\nBACHELOR OF TECHNOLOGY\nIN\nCOMPUTER SCIENCE AND ENGINEERING")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.italic = True
    
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("By\n")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.bold = True
    
    # Team Table
    team_table = doc.add_table(rows=4, cols=2)
    team_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    members = [
        ("MKN Sai Varun", "23BD1A660C"),
        ("Pranav Kasanagottu", "23BD1A660K"),
        ("Arnav Agarwal", "23BD1A660Y"),
        ("K. Preetham Reddy", "23BD1A661R")
    ]
    for idx, (name, roll) in enumerate(members):
        c0 = team_table.cell(idx, 0)
        c1 = team_table.cell(idx, 1)
        c0.width = Inches(3.2)
        c1.width = Inches(2.2)
        p0 = c0.paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r0 = p0.add_run(name)
        r0.font.name = "Times New Roman"
        r0.font.size = Pt(11)
        r0.font.bold = True
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r1 = p1.add_run(roll)
        r1.font.name = "Times New Roman"
        r1.font.size = Pt(11)
        r1.font.bold = True
    
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Under the guidance of\n")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.italic = True
    
    r_guide = p.add_run("Ms. M. Asha Jyothi\nAssistant Professor, Department of Computer Science & Engineering")
    r_guide.font.name = "Times New Roman"
    r_guide.font.size = Pt(12)
    r_guide.font.bold = True
    
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after = Pt(2)
    r_inst = p.add_run("DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING\nKESHAV MEMORIAL INSTITUTE OF TECHNOLOGY (AN AUTONOMOUS INSTITUTION)\nAccredited by NAAC with Grade 'A', Approved by AICTE, Affiliated to JNTUH\nNarayanaguda, Hyderabad, Telangana – 500029\nAcademic Year: 2026–2027")
    r_inst.font.name = "Times New Roman"
    r_inst.font.size = Pt(11)
    r_inst.font.bold = True
    
    doc.add_page_break()
    
    # ------------------ LIST OF FIGURES ------------------
    p_lof = doc.add_paragraph()
    p_lof.paragraph_format.space_before = Pt(12)
    p_lof.paragraph_format.space_after = Pt(8)
    r = p_lof.add_run("LIST OF FIGURES")
    r.font.name = "Times New Roman"
    r.font.size = Pt(14)
    r.font.bold = True
    
    lof_table = doc.add_table(rows=6, cols=3)
    lof_table.columns[0].width = Inches(0.8)
    lof_table.columns[1].width = Inches(4.8)
    lof_table.columns[2].width = Inches(0.9)
    
    lof_data = [
        ("S.No", "Name of Figure", "Page No."),
        ("1.", "Architecture Diagram of SentryFL System", "8"),
        ("2.", "Use Case Diagram of SentryFL", "22"),
        ("3.", "Sequence Diagram of SentryFL Federated Round Execution", "23"),
        ("4.", "State Chart Diagram of SentryFL Lifecycle", "24"),
        ("5.", "Deployment Diagram of SentryFL Infrastructure", "25")
    ]
    for row_idx, data in enumerate(lof_data):
        for col_idx, text in enumerate(data):
            cell = lof_table.cell(row_idx, col_idx)
            cell.paragraphs[0].text = text
            if col_idx == 0 or col_idx == 2:
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    format_table(lof_table)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(14)
    
    # ------------------ CONTENTS (INDEX) ------------------
    p_toc = doc.add_paragraph()
    p_toc.paragraph_format.space_before = Pt(8)
    p_toc.paragraph_format.space_after = Pt(8)
    r = p_toc.add_run("CONTENTS")
    r.font.name = "Times New Roman"
    r.font.size = Pt(14)
    r.font.bold = True
    
    toc_rows = [
        ("SECTION", "DESCRIPTION", "PAGE"),
        ("CHAPTER - 1", "INTRODUCTION", "1"),
        ("1.1", "Purpose of the Project", "3"),
        ("1.2", "Problem with Existing Systems", "4"),
        ("1.3", "Proposed System", "5"),
        ("1.4", "Scope of the Project", "6"),
        ("1.5", "Architecture Diagram", "8"),
        ("CHAPTER - 2", "LITERATURE SURVEY", "9"),
        ("2.1", "Survey of Existing Literature", "9"),
        ("2.2", "Comparative Analysis with Existing Systems", "12"),
        ("2.3", "Identified Research Gaps", "13"),
        ("CHAPTER - 3", "SOFTWARE REQUIREMENT SPECIFICATION (SRS)", "14"),
        ("3.1", "Introduction to SRS", "14"),
        ("3.2", "Role of SRS", "14"),
        ("3.3", "Requirements Specification Document", "15"),
        ("3.4", "Functional Requirements", "15"),
        ("3.5", "Non-Functional Requirements", "17"),
        ("3.6", "Performance Requirements", "18"),
        ("3.7", "Software Requirements", "19"),
        ("3.8", "Hardware Requirements", "19"),
        ("CHAPTER - 4", "SYSTEM DESIGN", "20"),
        ("4.1", "Introduction to UML", "20"),
        ("4.2", "UML Diagrams", "20"),
        ("4.2.1", "Use Case Diagram", "21"),
        ("4.2.2", "Sequence Diagram", "22"),
        ("4.2.3", "State Chart Diagram", "24"),
        ("4.2.4", "Deployment Diagram", "25"),
        ("4.3", "Technologies Used", "26")
    ]
    
    toc_table = doc.add_table(rows=len(toc_rows), cols=3)
    toc_table.columns[0].width = Inches(1.3)
    toc_table.columns[1].width = Inches(4.3)
    toc_table.columns[2].width = Inches(0.9)
    for row_idx, (sec, desc, pg) in enumerate(toc_rows):
        c0 = toc_table.cell(row_idx, 0)
        c1 = toc_table.cell(row_idx, 1)
        c2 = toc_table.cell(row_idx, 2)
        c0.paragraphs[0].text = sec
        c1.paragraphs[0].text = desc
        c2.paragraphs[0].text = pg
        c0.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
        c2.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        if "CHAPTER" in sec:
            c0.paragraphs[0].runs[0].font.bold = True
            c1.paragraphs[0].runs[0].font.bold = True
            c2.paragraphs[0].runs[0].font.bold = True
    format_table(toc_table)
    
    doc.add_page_break()
    
    # ------------------ CHAPTER 1 ------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("CHAPTER – 1: INTRODUCTION")
    r.font.name = "Times New Roman"
    r.font.size = Pt(16)
    r.font.bold = True
    r.font.color.rgb = RGBColor(16, 44, 87)
    
    # 1.1 Purpose
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("1.1 Purpose of the Project")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "The primary purpose of SentryFL is to design, implement, and validate an end-to-end, "
        "differentially private, and communication-efficient federated learning framework engineered "
        "specifically for unsupervised time-series anomaly detection in distributed security-sensing environments. "
        "Distributed infrastructures—such as Industrial Internet of Things (IIoT) sensors, supervisory control and "
        "data acquisition (SCADA) telemetry, and enterprise network intrusion detection checkpoints—generate continuous streams "
        "of sensitive operational data. Centralizing these data streams into a single server raises insurmountable data-privacy "
        "concerns, regulatory violations (such as GDPR and HIPAA), and network bandwidth bottlenecks."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "SentryFL directly addresses and resolves the critical limitations of the state-of-the-art base paper PeFAD "
        "(Xu et al., ACM SIGKDD 2024). While PeFAD successfully demonstrated the utility of pre-trained language model (PLM) "
        "backbones and parameter-efficient tuning for time-series anomaly detection, its privacy protections remain strictly heuristic "
        "(relying on mutual-information regularization during synthetic data sharing), offering zero mathematically bounded guarantees "
        "against model inversion, parameter snooping, or membership inference attacks (MIA). Furthermore, PeFAD was evaluated "
        "exclusively on server-grade GPUs (NVIDIA RTX 3090) without evaluating quantization, memory footprint, or CPU-only edge inference latencies."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run("SentryFL establishes four core research and engineering objectives:\n")
    bullet_items_1 = [
        ("Formal Privacy Guarantees: ", "Incorporate mathematically bounded Differential Privacy into the federated pipeline—supporting both client-level DP-FedAvg with Privacy Random Variable (PRV) accountant accounting and record-level DP-SGD via gradient norm clipping and calibrated Gaussian noise injection."),
        ("Empirical Privacy Auditing: ", "Build a concrete Membership Inference Attack (MIA) evaluation protocol directly assessing reconstruction-loss differentials between training set members and held-out non-members across varied privacy budgets (ε, δ)."),
        ("Rigorous Parameter and Communication Efficiency: ", "Transition beyond zeroed-gradient masking to FFA-LoRA (Freeze-Freezed-Adapter Low-Rank Adaptation) and dynamic INT8 Post-Training Quantization (PTQ), measuring wire transmission payloads and achieving upwards of a 97% reduction in upload bytes."),
        ("Production-Ready Multi-Tier Framework: ", "Deliver a complete 3-tier architecture comprising an interactive React/Vite dashboard, an authenticated Express/PostgreSQL API orchestrator, and an extensible PyTorch federated ML core validated on industrial telemetry (SMD) and cyber-security sensing (NSL-KDD).")
    ]
    for b_title, b_desc in bullet_items_1:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_bt = bp.add_run(b_title)
        r_bt.font.bold = True
        bp.add_run(b_desc)
    
    # 1.2 Problem
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("1.2 Problem with Existing Systems")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    prob_items = [
        ("Centralized Data Aggregation Vulnerabilities: ", "Traditional deep learning detectors (e.g., Anomaly Transformer, TimesNet, OmniAnomaly) assume all time-series telemetry is collected in a central warehouse. In critical security applications, this centralization creates high-value honeypots vulnerable to data breaches and breaches privacy mandates."),
        ("Heuristic and Unproven Privacy in Existing FL: ", "Existing federated anomaly detection frameworks, including the PeFAD base paper, attempt to mitigate data leakage by sharing synthetic time series generated via Variational Autoencoders (VAEs) constrained by mutual information penalties. However, this is a heuristic protection: the transmitted model weight updates and gradients themselves remain completely unshielded, leaving them vulnerable to gradient-inversion and membership-inference attacks."),
        ("Absence of Empirical Privacy Verification: ", "Current frameworks argue privacy in theory without subjecting the trained global or local models to empirical adversarial tests (such as MIAs), leaving the actual leakage rates unknown."),
        ("Idealized Hardware Assumptions: ", "Existing studies measure parameter reduction only in terms of floating-point parameter count on server-grade GPUs. They fail to benchmark communication payloads on actual serialization streams, and they omit INT8 post-training quantization and CPU-only runtime constraints typical of edge sensor nodes."),
        ("Vulnerability to Malicious Clients (Poisoning): ", "Conventional federated frameworks rely on canonical weighted Federated Averaging (FedAvg). In a distributed sensor network, a single compromised node can perform label-flipping, gradient corruption, or noise injection, driving the global anomaly detection boundary into collapse."),
        ("Data Leakage in Metric Evaluation: ", "Many published time-series anomaly detection papers select anomaly decision thresholds on the test set itself (or apply over-optimistic point-adjustment heuristics without clean baseline separation), leading to artificially inflated performance metrics that do not generalize to real production environments.")
    ]
    for idx, (p_title, p_desc) in enumerate(prob_items, 1):
        bp = doc.add_paragraph()
        bp.paragraph_format.space_after = Pt(4)
        bp.paragraph_format.line_spacing = 1.15
        r_num = bp.add_run(f"{idx}. {p_title}")
        r_num.font.bold = True
        bp.add_run(p_desc)
        
    # 1.3 Proposed System
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("1.3 Proposed System")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "SentryFL is architected as an industrial-grade, three-tier federated learning framework that introduces formal mathematical privacy, "
        "rigorous communication efficiency, and empirical security validation to time-series anomaly detection. The system executes in coordinated federated rounds:"
    )
    
    flow_items = [
        ("Local PLM Feature Extractor: ", "Each sensor client processes multivariate time-series windows through non-overlapping patching (lp = 10). A pre-trained GPT-2 backbone extracts deep temporal dynamics across modalities. Rather than transmitting dense layers, FFA-LoRA adapters are attached to attention blocks, freezing matrix A and updating only low-rank matrix B and projection heads."),
        ("Anomaly-Driven Mask Selection (ADMS): ", "Prior to local reconstruction training, clients score incoming patches using Singular Spectrum Analysis (SSA) residual energy and inter-patch cosine distances. Highly aberrant patches receive prioritized masking, forcing the model to learn robust representations of change points without allowing anomalies to corrupt normal state reconstruction."),
        ("Differential Privacy Mechanisms: ", "SentryFL integrates two complementary DP modes: (i) DP-FedAvg (Federation-Level), where clients upload model parameter deltas clipped to maximum L2 norm C, and the server injects calibrated Gaussian noise N(0, σ² C² / K²), tracked rigorously via the Privacy Random Variable (PRV) accountant; and (ii) Record-Level DP-SGD via Opacus for micro-batch clipping."),
        ("Empirical MIA Evaluator: ", "Shadow models and loss-distribution analyzers compute true positive vs. false positive membership inference rates on reconstructed samples, validating that attacker accuracy drops toward a random-guess baseline (0.50) as the privacy budget ε tightens."),
        ("Byzantine-Robust Defense: ", "Implements Trimmed-Mean aggregation, which sorts client parameter updates coordinate-wise and trims the extreme β-fraction, preventing poisoned or noisy clients from skewing the global detector."),
        ("Post-Training Quantization: ", "Converged models undergo dynamic INT8 quantization, cutting on-disk storage by 60–75% and enabling low-latency CPU-only inference on distributed sensor nodes.")
    ]
    for f_title, f_desc in flow_items:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_ft = bp.add_run(f_title)
        r_ft.font.bold = True
        bp.add_run(f_desc)
        
    # 1.4 Scope
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("1.4 Scope of the Project")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "The scope of SentryFL encompasses the design, implementation, and empirical validation of a secure, production-grade federated anomaly detection pipeline:\n"
        "1. Temporal Data Preprocessing: Strict non-overlapping train/validation/test splits (80/10/10) with training-only MinMax normalization to guarantee zero temporal data leakage.\n"
        "2. Dataset Benchmark Scope: Primary evaluation on SMD (Server Machine Dataset) for direct parity with the PeFAD base paper and NSL-KDD for distributed network intrusion sensing, with architectural hooks for PSM, MSL, and SWaT.\n"
        "3. Parameter-Efficient Adaptation: Implementation and benchmark comparison between Full Fine-Tuning, Linear Head-only Tuning, vanilla LoRA, and FFA-LoRA.\n"
        "4. Formal DP Accounting: Analytical (ε, δ) budgeting using the PRV and Renyi Differential Privacy (RDP) accountants across varied noise multipliers (σ ∈ [0.5, 4.0]).\n"
        "5. Empirical Privacy Auditing: Implementation of a reconstruction-error-based Membership Inference Attack protocol reporting Area Under the Attack ROC Curve (AUC) and attack accuracy.\n"
        "6. Edge Quantization & Profiling: In-depth evaluation of model size reduction (FP32 vs. INT8), CPU inference latency, and memory footprint.\n"
        "7. Byzantine Fault Tolerance: Evaluation of Trimmed-Mean aggregation under simulated malicious client fractions (10%–30% adversarial poisoning).\n"
        "8. Three-Tier Software Deployment: A full-stack delivery consisting of a browser UI, REST/WebSocket API services, Docker containerization, and reproducible experiment manifests with cryptographic checksums."
    )
    
    # 1.5 Architecture Diagram
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("1.5 Architecture Diagram")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    arch_diagram_text = (
        "                                  SENTRYFL SYSTEM ARCHITECTURE\n"
        "       \n"
        "   +------------------------------------------------------------------------+\n"
        "   |                       TIER 1: WEB DASHBOARD                            |\n"
        "   |  [Live Training Monitor]  [DP Budget Tracker]  [MIA Privacy Inspector] |\n"
        "   +-----------------------------------┬------------------------------------+\n"
        "                                       | HTTP / WebSocket\n"
        "                                       v\n"
        "   +------------------------------------------------------------------------+\n"
        "   |                    TIER 2: API & ORCHESTRATION SERVER                  |\n"
        "   |      [JWT Auth] --- [Prisma ORM / PostgreSQL] --- [Run Dispatcher]     |\n"
        "   +-----------------------------------┬------------------------------------+\n"
        "                                       | Subprocess / Transport Contract\n"
        "                                       v\n"
        "   +------------------------------------------------------------------------+\n"
        "   |                     TIER 3: PYTHON FEDERATED CORE                      |\n"
        "   |                                                                        |\n"
        "   |      +----------------------------------------------------------+      |\n"
        "   |      |                 FEDERATED SERVER                         |      |\n"
        "   |      |  * Global Model Coordinator (GPT-2 + FFA-LoRA)           |      |\n"
        "   |      |  * Aggregator (Weighted FedAvg / Trimmed-Mean)           |      |\n"
        "   |      |  * DP-FedAvg Engine (Delta Clip C + Gaussian Noise σ)    |      |\n"
        "   |      |  * PRV Privacy Accountant (Tracks Cumulative ε, δ)       |      |\n"
        "   |      +--------------┬----------------------------^--------------+      |\n"
        "   |                     | Broadcast Global           | Upload Clipped      |\n"
        "   |                     | Parameters                 | Adapters            |\n"
        "   |                     v                            |                     |\n"
        "   |      +-----------------------------++---------------------------+      |\n"
        "   |      |       CLIENT NODE 1         ||       CLIENT NODE N       |      |\n"
        "   |      |  * Private Shard (SMD/KDD)  ||  * Private Shard (SMD)   |      |\n"
        "   |      |  * ADMS Importance Masking  ||  * ADMS Importance       |      |\n"
        "   |      |  * Frozen PLM Backbone      ||  * Frozen PLM Backbone   |      |\n"
        "   |      |  * FFA-LoRA Fine-Tuning     ||  * FFA-LoRA Fine-Tuning  |      |\n"
        "   |      |  * Comm-Meter Serialization ||  * Comm-Meter            |      |\n"
        "   |      +-----------------------------++---------------------------+      |\n"
        "   |                                                                        |\n"
        "   |   [MIA Auditor] --- [INT8 Quantization Engine] --- [Evaluation Engine] |\n"
        "   |    (Member vs Non)    (Dynamic PyTorch PTQ)       (Val-split Threshold)|\n"
        "   +------------------------------------------------------------------------+"
    )
    add_code_diagram_box(doc, arch_diagram_text, "Figure 1: Architecture Diagram of SentryFL System")
    
    doc.add_page_break()
    
    # ------------------ CHAPTER 2 ------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("CHAPTER – 2: LITERATURE SURVEY")
    r.font.name = "Times New Roman"
    r.font.size = Pt(16)
    r.font.bold = True
    r.font.color.rgb = RGBColor(16, 44, 87)
    
    # 2.1 Survey
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("2.1 Survey of Existing Literature")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "The convergence of deep time-series anomaly detection, federated learning, and privacy-preserving machine learning "
        "forms the scientific foundation of SentryFL. Below is a detailed analysis of key literature and theoretical frameworks:"
    )
    
    # Survey item 1: PeFAD
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("1. PeFAD: Parameter-Efficient Federated Framework for Time Series Anomaly Detection (Xu et al., ACM SIGKDD 2024):\n")
    r_sub.font.bold = True
    p.add_run(
        "Xu et al. pioneered the use of frozen Pre-trained Language Models (PLMs, specifically GPT-2) as universal sequential computation engines "
        "for decentralized multivariate time series. To counter cross-client heterogeneity without centralizing raw data, PeFAD introduced "
        "Privacy-Preserving Shared Dataset synthesis (PPDS), wherein each client trains a local Variational Autoencoder (VAE) constrained by "
        "Wasserstein Distance W(·) (to preserve distributional similarity) and Mutual Information minimization I(·) (to reduce data inferability):"
    )
    add_equation_box(doc, "min_{T_{s,i}}  L_vae + α₁ · W(T_i, T_{s,i}) + α₂ · I(T_i ; T_{s,i})", "2.1")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "Clients pool these synthetic windows on the server to form D_sh and perform representation-level Knowledge Distillation "
        "via a consistency regularization loss:\n"
    )
    add_equation_box(doc, "L(θ_i ; T_i) = (1/n) Σ ||T̂_{i,j} - T_{i,j}||² + λ · ||F(θ_i, D_sh) - F(θ_g, D_sh)||", "2.2")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "While PeFAD showed state-of-the-art F1 improvements (up to 28.74% over prior baselines) and reduced communication by fine-tuning "
        "only the top layers, its privacy protection is entirely heuristic. The actual transmitted model parameters θ_{e,i} are transmitted unshielded, "
        "leaving them completely vulnerable to membership inference and reconstruction attacks."
    )
    
    # Survey item 2: DP-SGD
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("2. Deep Learning with Differential Privacy (Abadi et al., ACM CCS 2016):\n")
    r_sub.font.bold = True
    p.add_run(
        "Abadi et al. formalized Differential Privacy in deep learning via Differentially Private Stochastic Gradient Descent (DP-SGD). "
        "By clipping per-sample gradients to a fixed threshold C and injecting calibrated Gaussian noise, DP-SGD guarantees that the presence "
        "or absence of any single data point does not discernibly affect the resulting model distribution:"
    )
    add_equation_box(doc, "g_t = (1 / B) · [ Σ g_t(x_i) · min(1, C / ||g_t(x_i)||₂) + N(0, σ² C² I) ]", "2.3")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "Recent advancements in privacy accounting, such as the Privacy Random Variable (PRV) accountant (Gopi et al., 2021), "
        "provide numerically tight compositions of Gaussian mechanisms, overcoming the loose bounds of classical Moments Accountants. "
        "SentryFL applies these formal principles directly to federated parameter exchanges."
    )
    
    # Survey item 3: FedAvg
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("3. Communication-Efficient Federated Learning via FedAvg (McMahan et al., AISTATS 2017):\n")
    r_sub.font.bold = True
    p.add_run(
        "McMahan et al. introduced Federated Averaging (FedAvg), aggregating decentralized client model updates via sample-weighted averaging:\n"
    )
    add_equation_box(doc, "θ_{t+1} = Σ (n_k / n) · θ_{t+1}^k", "2.4")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "While communication-effective, vanilla FedAvg is susceptible to gradient inversion attacks and offers zero resilience against "
        "adversarial or corrupted participants. SentryFL enhances this with DP-FedAvg delta clipping and robust aggregation."
    )
    
    # Survey item 4: MIA
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("4. Membership Inference Attacks Against Machine Learning Models (Shokri et al., IEEE S&P 2017):\n")
    r_sub.font.bold = True
    p.add_run(
        "Shokri et al. demonstrated that machine learning models unintentionally memorize details of their training samples. In reconstruction-based "
        "anomaly detectors, training members exhibit significantly lower reconstruction errors than non-members. SentryFL operationalizes this insight "
        "into an automated privacy auditor, evaluating whether DP noise suppresses this reconstruction loss gap and drives attacker accuracy toward 0.50."
    )
    
    # Survey item 5: FFA-LoRA
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("5. Freeze-Freezed-Adapter LoRA (FFA-LoRA, 2024) and Parameter-Efficient Fine-Tuning (PEFT):\n")
    r_sub.font.bold = True
    p.add_run(
        "Standard LoRA (Hu et al., ICLR 2022) parameterizes weight updates as W = W₀ + (α/r)(B · A). However, updating both matrices A and B requires "
        "exchanging both over the network. FFA-LoRA keeps matrix A permanently frozen after initialization, updating only low-rank matrix B:"
    )
    add_equation_box(doc, "ΔW = (α / r) · (B_trainable · A_frozen)", "2.5")
    p.add_run(
        "This cuts the trainable parameter footprint by 50% relative to standard LoRA and achieves over 97% reduction in wire upload bytes compared to full head fine-tuning."
    )
    
    # Survey item 6: Byzantine Robustness
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    r_sub = p.add_run("6. Byzantine-Robust Distributed Learning (Yin et al., ICML 2018):\n")
    r_sub.font.bold = True
    p.add_run(
        "Yin et al. established statistical optimality for robust distributed optimization, showing that coordinate-wise Trimmed-Mean aggregation "
        "successfully eliminates the influence of Byzantine or poisoned client updates up to a corruption fraction β < 0.5:"
    )
    add_equation_box(doc, "[TrimmedMean_β(θ)]_j = [1 / ((1 - 2β) · K)] · Σ_{k = βK + 1}^{(1 - β)K} θ_{(k), j}", "2.6")
    
    # 2.2 Comparative Analysis Table
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("2.2 Comparative Analysis with Existing Systems")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    comp_table = doc.add_table(rows=9, cols=5)
    comp_table.columns[0].width = Inches(1.5)
    comp_table.columns[1].width = Inches(1.2)
    comp_table.columns[2].width = Inches(1.2)
    comp_table.columns[3].width = Inches(1.3)
    comp_table.columns[4].width = Inches(1.4)
    
    comp_data = [
        ("Dimension / System", "Centralized Deep (TimesNet, AT)", "Plain Federated (FedAvg + LSTM)", "PeFAD (Base Paper, KDD '24)", "SentryFL (Our Implementation)"),
        ("Data Privacy Architecture", "None (Centralized data)", "Decentralized raw data", "Decentralized data", "Decentralized data + Formal DP"),
        ("Privacy Guarantee Type", "None", "None", "Heuristic (Mutual Info)", "Formal (ε, δ) via PRV Accountant"),
        ("Privacy Leakage Auditing", "None", "None", "None", "Automated Empirical MIA Engine"),
        ("Model Backbone", "Specialized Transformer", "RNN / LSTM", "Pre-trained GPT-2", "Pre-trained GPT-2 + FFA-LoRA"),
        ("Communication Optimization", "N/A (Centralized)", "Dense Model Exchange", "Top layers + gradient mask", "Adapter-Only (~97% wire reduction)"),
        ("Edge Deployment Realism", "Server GPU only", "Server GPU only", "Server GPU (RTX 3090)", "INT8 Quantization + CPU Latency"),
        ("Malicious Node Robustness", "N/A", "None (Vulnerable)", "None (Weighted FedAvg)", "Byzantine Trimmed-Mean Aggregation"),
        ("Evaluated Domains", "General Time Series", "General Time Series", "Server Telemetry", "Server (SMD) + Intrusion (NSL-KDD)")
    ]
    for r_idx, row in enumerate(comp_data):
        for c_idx, val in enumerate(row):
            cell = comp_table.cell(r_idx, c_idx)
            cell.paragraphs[0].text = val
    format_table(comp_table)
    
    # 2.3 Identified Research Gaps
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("2.3 Identified Research Gaps")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    gaps = [
        ("Gap 1: Absence of Formal Differential Privacy in PeFAD — ", "PeFAD's mutual information regularization on synthetic data does not bound parameter leakage from the transmitted weights themselves, leaving client parameters vulnerable to gradient inversion and membership inference."),
        ("Gap 2: Lack of Empirical Privacy Auditing — ", "Published federated time-series literature frequently asserts privacy benefits without quantifying vulnerability to adversarial inference attacks such as Membership Inference Attacks (MIA)."),
        ("Gap 3: Idealized Communication Claims vs. True Wire Bytes — ", "Prior works claim communication reductions by zeroing gradient parameters in memory, yet transmitting these sparse tensors still consumes full network bandwidth unless specialized low-rank serialization (like FFA-LoRA) is utilized."),
        ("Gap 4: Omission of Edge-Hardware Feasibility — ", "The literature lacks empirical benchmarks for post-training quantization (INT8), on-disk compression, and inference latency on CPU-only edge nodes."),
        ("Gap 5: Vulnerability of Federated Time-Series Detectors to Poisoning — ", "Weighted FedAvg provides zero protection against adversarial or misconfigured sensor clients injecting poisoned weights, necessitating Byzantine-robust aggregation.")
    ]
    for g_title, g_desc in gaps:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_gt = bp.add_run(g_title)
        r_gt.font.bold = True
        bp.add_run(g_desc)
        
    doc.add_page_break()
    
    # ------------------ CHAPTER 3 ------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("CHAPTER – 3: SOFTWARE REQUIREMENT SPECIFICATION (SRS)")
    r.font.name = "Times New Roman"
    r.font.size = Pt(16)
    r.font.bold = True
    r.font.color.rgb = RGBColor(16, 44, 87)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.1 Introduction to SRS")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "A Software Requirement Specification (SRS) establishes a complete description of the behavior, capabilities, constraints, "
        "and operational interfaces of a software system. It defines both what the system must achieve (functional requirements) "
        "and the operational standards it must maintain (non-functional requirements), acting as the definitive technical contract for development, validation, and deployment."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.2 Role of SRS")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "The role of this SRS is to formally outline the architectural, algorithmic, and engineering requirements for SentryFL. "
        "It governs the development of the parameter-efficient backbone, the differential privacy pipeline, the empirical membership inference auditor, "
        "the federated aggregation engines, the post-training quantization suite, and the multi-tier dashboard/API interfaces."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.3 Requirements Specification Document")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "SentryFL shall ingest decentralized multivariate time-series datasets across simulated or networked sensor nodes. It shall train an unsupervised "
        "reconstruction-based anomaly detector using a parameter-efficient language model backbone. The framework must enforce mathematically bounded "
        "differential privacy on client parameter exchanges, rigorously account for consumed privacy budgets (ε, δ), expose models to empirical membership "
        "inference attacks, quantize converged models to INT8 for edge deployment, and provide real-time operational visibility through an authenticated dashboard and API service."
    )
    
    # 3.4 Functional Requirements
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.4 Functional Requirements")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    fr_list = [
        ("FR-1: Temporal Preprocessing & Data Partitioning: ", "The system shall partition multivariate datasets (SMD, NSL-KDD) into deterministic, non-overlapping train (80%), validation (10%), and test (10%) splits. Normalization parameters must be computed strictly on training data to prevent temporal lookahead leakage."),
        ("FR-2: Patching and PLM Adapter Injection: ", "The system shall segment input windows into non-overlapping patches (lp = 10), project them into GPT-2 embedding spaces, and inject trainable FFA-LoRA / LoRA adapter modules while freezing pre-trained transformer blocks."),
        ("FR-3: Anomaly-Driven Mask Selection (ADMS): ", "The system shall compute SSA residual components and inter-patch cosine similarities, generating non-uniform masking probabilities that prioritize anomalous segments during local reconstruction training."),
        ("FR-4: Formal Differential Privacy Implementation: ", "The system shall support server-side DP-FedAvg by clipping local client updates to an L2 norm threshold C and injecting calibrated Gaussian noise. It shall track cumulative privacy expenditure (ε, δ) across all rounds using the PRV Accountant."),
        ("FR-5: Record-Level DP-SGD: ", "The system shall support localized sample-level differential privacy utilizing Opacus micro-batch clipping."),
        ("FR-6: Empirical MIA Auditing: ", "The system shall execute an empirical Membership Inference Attack against trained models, measuring the disparity between member and non-member reconstruction loss distributions and returning attack accuracy and ROC-AUC."),
        ("FR-7: Byzantine-Robust Aggregation: ", "The server shall provide an optional coordinate-wise Trimmed-Mean aggregation algorithm to filter out malicious or noisy client updates."),
        ("FR-8: Dynamic INT8 Post-Training Quantization: ", "The system shall quantize converged FP32 PyTorch weights into INT8 representations, evaluating memory compression, reconstruction MSE drift, and CPU inference latency."),
        ("FR-9: Client Scaling & Wire-Byte Accounting: ", "The system shall track the actual serialized byte footprint of transmitted payloads across simulated client cohorts ranging from 5 to 500 clients."),
        ("FR-10: Multi-Tier API & Dashboard Orchestration: ", "The system shall provide an Express.js backend with JWT authentication, audit logging, WebSocket streaming, and a React-based frontend dashboard for experiment control and visual analytics.")
    ]
    for fr_title, fr_desc in fr_list:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_fr = bp.add_run(fr_title)
        r_fr.font.bold = True
        bp.add_run(fr_desc)
        
    # 3.5 Non-Functional Requirements
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.5 Non-Functional Requirements")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    nfr_list = [
        ("NFR-1: Mathematical Privacy Rigor: ", "All reported privacy guarantees must follow (ε, δ)-differential privacy bounds without relying on heuristic approximations."),
        ("NFR-2: Communication Efficiency: ", "Transmitted model updates using FFA-LoRA adapters must achieve at least a 90% measured reduction in wire bytes compared to full head transmissions."),
        ("NFR-3: Reproducibility & Provenance: ", "Every training execution must generate an immutable manifest.json recording the random seed, git commit SHA, configuration hash, dataset checksums, and dependency versions."),
        ("NFR-4: Fault Tolerance & Checkpointing: ", "The federated server must maintain persistent state checkpoints at the conclusion of every round, enabling recovery of models, optimizer states, and PRV privacy ledger history after system interruptions."),
        ("NFR-5: Modular Extensibility: ", "The architecture must decouple model backbones, privacy mechanisms, aggregation algorithms, and dataset loaders behind abstract interfaces."),
        ("NFR-6: Security & Isolation: ", "The API server must authenticate all administrative actions via JWT tokens, enforce role-based access control, and protect remote enrollment using server secrets.")
    ]
    for nfr_title, nfr_desc in nfr_list:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_nfr = bp.add_run(nfr_title)
        r_nfr.font.bold = True
        bp.add_run(nfr_desc)
        
    # 3.6 Performance Requirements
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.6 Performance Requirements")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    pr_list = [
        ("PR-1: Anomaly Detection Accuracy: ", "SentryFL shall achieve an F1-Score ≥ 88.0% on the SMD dataset and ≥ 85.0% on NSL-KDD under non-private baselines, with private implementations (ε ∈ [3, 8]) retaining within 3–5% of non-private F1."),
        ("PR-2: Empirical Privacy Protection: ", "Under a calibrated privacy budget (ε ≤ 5.0), empirical MIA attacker accuracy shall drop to ≤ 0.55 (where 0.50 represents a random guess)."),
        ("PR-3: Quantization Compression: ", "Post-training INT8 quantization must achieve at least a 60% reduction in on-disk model weight footprint relative to FP32 baselines."),
        ("PR-4: Edge CPU Latency: ", "Quantized INT8 inference must execute within ≤ 50 ms per time-series window on standard x86/ARM CPU architectures."),
        ("PR-5: Scalability: ", "The federated coordinator must simulate up to 500 client updates within the scaling harness without encountering process memory exhaustion.")
    ]
    for pr_title, pr_desc in pr_list:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_pr = bp.add_run(pr_title)
        r_pr.font.bold = True
        bp.add_run(pr_desc)
        
    # 3.7 & 3.8
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.7 Software Requirements")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "• Operating System: Linux (Ubuntu 20.04/22.04 LTS), macOS, or Windows 10/11 with WSL2 / PowerShell 7.\n"
        "• Programming Languages: Python 3.8+ (ML Core), TypeScript / Node.js 18+ (API & Frontend).\n"
        "• Machine Learning Libraries: PyTorch 2.0+, Hugging Face Transformers, Opacus (DP-SGD & PRV Accounting), Scikit-Learn.\n"
        "• Data Processing: NumPy, Pandas, SciPy (Singular Spectrum Analysis).\n"
        "• API & Database: Express.js, Prisma ORM, PostgreSQL 14+, WebSockets (ws).\n"
        "• Dashboard Framework: React 18, Vite, Tailwind CSS, Lucide React, Recharts.\n"
        "• Version Control & DevOps: Git, Docker, Docker-Compose."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("3.8 Hardware Requirements")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "• Development/Simulation Host: Multi-core x86_64 CPU (minimum 4 cores, 8 threads).\n"
        "• System Memory (RAM): Minimum 16 GB RAM (32 GB recommended for multi-client simulations).\n"
        "• GPU Acceleration (Optional): NVIDIA GPU with CUDA 11.8+ (e.g., RTX 3060, T4, RTX 3090) for rapid training; CPU-only execution fully supported for inference, quantization, and evaluation.\n"
        "• Storage: Minimum 20 GB free SSD storage for datasets (SMD, NSL-KDD), experiment manifests, and checkpoints."
    )
    
    doc.add_page_break()
    
    # ------------------ CHAPTER 4 ------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("CHAPTER – 4: SYSTEM DESIGN")
    r.font.name = "Times New Roman"
    r.font.size = Pt(16)
    r.font.bold = True
    r.font.color.rgb = RGBColor(16, 44, 87)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.1 Introduction to UML")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "The Unified Modeling Language (UML) is an industry-standard visual modeling language used to specify, visualize, "
        "construct, and document the structural and behavioral characteristics of software systems. For SentryFL, UML diagrams formalize system operations:\n"
        "• The Use Case Diagram models user and external service interactions with the platform.\n"
        "• The Sequence Diagram illustrates the chronological message exchange during a privacy-preserving federated round.\n"
        "• The State Chart Diagram traces the lifecycle transitions of client nodes and server aggregation phases.\n"
        "• The Deployment Diagram defines the physical distribution of Docker containers, databases, and client nodes across hardware boundaries."
    )
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.2 UML Diagrams")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    # 4.2.1 Use Case
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.2.1 Use Case Diagram")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.bold = True
    
    uc_text = (
        "                         SENTRYFL USE CASE DIAGRAM\n"
        "                         \n"
        "             +-----------------------------------------------+\n"
        "             |                SentryFL System                |\n"
        "             |                                               |\n"
        "             |   (Configure & Initialize Experiment)         |\n"
        "             |         |                                     |\n"
        "             |         |--<<include>>--> (Set DP Budget ε, δ)|\n"
        "             |         \\--<<include>>--> (Select PEFT Mode)  |\n"
        "             |                                               |\n"
        "  (Admin /   |   (Launch Federated Training)                 |\n"
        " Researcher) --->      |                                     |\n"
        "    o        |         |--<<include>>--> (Execute Rounds)    |\n"
        "   /|\\       |         \\--<<include>>--> (Log PRV Budget)    |\n"
        "   / \\       |                                               |\n"
        "             |   (Run Empirical MIA Evaluation)              |\n"
        "             |   (Apply Post-Training INT8 Quantization)     |\n"
        "             |   (Inspect Anomaly Loss & Metrics)            |\n"
        "             |   (Manage User Access & Download Checkpoints) |\n"
        "             |                                               |\n"
        "             |   (Enroll Client with Secret Token) <---------+--- (Sensor Node)\n"
        "             |   (Download Global Parameters) <--------------+---     o\n"
        "             |   (Train Local Adapter & Upload Clipped Δ) ---+---    /|\\\n"
        "             |                                               |       / \\\n"
        "             +-----------------------------------------------+"
    )
    add_code_diagram_box(doc, uc_text, "Figure 2: Use Case Diagram of SentryFL")
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "Use Case Descriptions:\n"
        "• Configure & Initialize Experiment: The researcher defines model parameters, datasets, client counts, adapter configurations (FFA-LoRA vs. LoRA), and differential privacy budgets.\n"
        "• Launch Federated Training: The server orchestrates round execution, broadcasts weights, collects clipped updates, applies Gaussian noise, and aggregates models.\n"
        "• Run Empirical MIA Evaluation: The administrator triggers shadow-model inference to test the converged model against membership reconstruction attacks.\n"
        "• Apply Post-Training Quantization: The system converts FP32 weights into INT8 format and runs CPU latency benchmarks.\n"
        "• Client Round Participation: Sensor nodes register securely, receive global weights, train locally with ADMS masking, and return clipped parameter updates."
    )
    
    # 4.2.2 Sequence
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.2.2 Sequence Diagram")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.bold = True
    
    seq_text = (
        "User/Admin        Server API          FederatedServer          Client Nodes         PRV Ledger\n"
        "    |                 |                      |                      |                   |\n"
        "    | 1. StartRun()   |                      |                      |                   |\n"
        "    |---------------->|                      |                      |                   |\n"
        "    |                 | 2. InitRound(t)      |                      |                   |\n"
        "    |                 |--------------------->|                      |                   |\n"
        "    |                 |                      | 3. BroadcastParams() |                   |\n"
        "    |                 |                      |--------------------->|                   |\n"
        "    |                 |                      |                      |                   |\n"
        "    |                 |                      |                      | [Apply ADMS Mask] |\n"
        "    |                 |                      |                      | [Train FFA-LoRA]  |\n"
        "    |                 |                      |                      | [Compute Delta Δ] |\n"
        "    |                 |                      |                      | [Clip ||Δ|| ≤ C]  |\n"
        "    |                 |                      | 4. UploadClippedΔ()  |                   |\n"
        "    |                 |                      |<---------------------|                   |\n"
        "    |                 |                      |                      |                   |\n"
        "    |                 |                      | 5. AddGaussianNoise(σ, C)                |\n"
        "    |                 |                      |    Aggregate(TrimmedMean / FedAvg)       |\n"
        "    |                 |                      |    UpdateGlobalWeights()                 |\n"
        "    |                 |                      |                                          |\n"
        "    |                 |                      | 6. RecordStep(σ)     |                   |\n"
        "    |                 |                      |----------------------------------------->|\n"
        "    |                 |                      | 7. Return (ε, δ)     |                   |\n"
        "    |                 |                      |<-----------------------------------------|\n"
        "    |                 | 8. EmitMetrics(WS)   |                      |                   |\n"
        "    |                 |<---------------------|                      |                   |\n"
        "    | 9. LiveUpdate() |                      |                      |                   |\n"
        "    |<----------------|                      |                      |                   |"
    )
    add_code_diagram_box(doc, seq_text, "Figure 3: Sequence Diagram of SentryFL Federated Round Execution")
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    p.add_run(
        "Sequence Flow:\n"
        "1. The administrator triggers an experiment run via the dashboard/API.\n"
        "2. The FederatedServer initializes round t and extracts trainable parameter states.\n"
        "3. Global weights are dispatched to participating client sensor nodes.\n"
        "4. Clients preprocess data, select anomalous patches using ADMS, train FFA-LoRA adapters, compute parameter deltas Δ_k = θ_k^{(t)} - θ_{global}^{(t)}, clip them to threshold C, and upload the clipped deltas.\n"
        "5. The server applies calibrated Gaussian noise N(0, σ² C² / K²) to aggregated deltas, executes Trimmed-Mean / FedAvg updates, and updates the global model.\n"
        "6. The server logs the step to the PRV Ledger, updating the cumulative (ε, δ) privacy expenditure.\n"
        "7. Real-time metrics (loss, communication payload, privacy spend) are streamed via WebSockets back to the dashboard."
    )
    
    # 4.2.3 State Chart
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.2.3 State Chart Diagram")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.bold = True
    
    sc_text = (
        "       +------------------------+\n"
        "  ---->|      UNINITIALIZED     |\n"
        "       +-----------┬------------+\n"
        "                   | Load Config & Manifest\n"
        "                   v\n"
        "       +------------------------+\n"
        "       |   READY / INITIALIZED  |\n"
        "       +-----------┬------------+\n"
        "                   | Start Federated Round\n"
        "                   v\n"
        "  +--------------->+------------------------+\n"
        "  |                | BROADCASTING_WEIGHTS   |\n"
        "  |                +-----------┬------------+\n"
        "  |                            | Dispatched to Clients\n"
        "  |                            v\n"
        "  |                +------------------------+\n"
        "  |                | LOCAL_CLIENT_TRAINING  | (ADMS Masking + FFA-LoRA Training)\n"
        "  |                +-----------┬------------+\n"
        "  |                            | Updates Clipped (||Δ|| ≤ C)\n"
        "  |                            v\n"
        "  |                +------------------------+\n"
        "  |                | COLLECTING_UPDATES     |\n"
        "  |                +-----------┬------------+\n"
        "  |                            | Quorum Reached (n ≥ MinClients)\n"
        "  |                            v\n"
        "  |                +------------------------+\n"
        "  |                | AGGREGATING_AND_NOISING| (Gaussian Noise + Trimmed-Mean)\n"
        "  |                +-----------┬------------+\n"
        "  |                            | Step Privacy Ledger (PRV)\n"
        "  |                            v\n"
        "  |   [Round < MaxRounds]      |\n"
        "  +-- No ----------------------+ Check Termination Conditions\n"
        "                               |\n"
        "                               v Yes [Target ε Reached OR Max Rounds]\n"
        "                   +------------------------+\n"
        "                   |    POST_PROCESSING     | (MIA Audit + INT8 Quantization)\n"
        "                   +-----------┬------------+\n"
        "                               | Save Checkpoint & Manifest\n"
        "                               v\n"
        "                   +------------------------+\n"
        "                   |       COMPLETED        |\n"
        "                   +------------------------+"
    )
    add_code_diagram_box(doc, sc_text, "Figure 4: State Chart Diagram of SentryFL Lifecycle")
    
    # 4.2.4 Deployment
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.2.4 Deployment Diagram")
    r.font.name = "Times New Roman"
    r.font.size = Pt(12)
    r.font.bold = True
    
    dep_text = (
        " +------------------------------------------------------------------------+\n"
        " |                      CLIENT WORKSTATION / BROWSER                      |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |   | Web Browser: React Dashboard (Vite SPA, Port 5173)             |   |\n"
        " |   +-------------------------------┬--------------------------------+   |\n"
        " +-----------------------------------┼------------------------------------+\n"
        "                                     | HTTP / WSS\n"
        "                                     v\n"
        " +------------------------------------------------------------------------+\n"
        " |                      APPLICATION HOST / DOCKER ENGINE                  |\n"
        " |                                                                        |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |   | Container 1: API Server (Node.js/Express, Port 5000)           |   |\n"
        " |   |  * Auth Middleware, REST Controllers, WebSocket Broadcaster    |   |\n"
        " |   +-------------------------------┬--------------------------------+   |\n"
        " |                                   | Prisma Connection                  |\n"
        " |                                   v                                    |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |   | Container 2: PostgreSQL Database (Port 5432)                   |   |\n"
        " |   |  * User Records, Experiment Metadata, Audit Logs               |   |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |                                   | Process Invocation / IPC           |\n"
        " |                                   v                                    |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |   | Host / Container 3: Python ML Execution Engine (Python 3.10)   |   |\n"
        " |   |  * SentryFL Federated Server & Simulation Harness              |   |\n"
        " |   |  * Local Checkpoints, Manifests, Quantized Models              |   |\n"
        " |   +-------------------------------┬--------------------------------+   |\n"
        " +-----------------------------------┼------------------------------------+\n"
        "                                     | Secure Local/Remote Transport\n"
        "                                     v\n"
        " +------------------------------------------------------------------------+\n"
        " |                    DISTRIBUTED SENSOR NODES (CLIENTS)                  |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " |   | Edge Device / Simulated Sensor Node                            |   |\n"
        " |   |  * Local Telemetry Data (SMD / NSL-KDD Shard)                  |   |\n"
        " |   |  * Lightweight PyTorch Runtime (FFA-LoRA Adapter, ADMS Masking)|   |\n"
        " |   +----------------------------------------------------------------+   |\n"
        " +------------------------------------------------------------------------+"
    )
    add_code_diagram_box(doc, dep_text, "Figure 5: Deployment Diagram of SentryFL Infrastructure")
    
    # 4.3 Technologies Used
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("4.3 Technologies Used")
    r.font.name = "Times New Roman"
    r.font.size = Pt(13)
    r.font.bold = True
    
    tech_list = [
        ("Python 3.8+: ", "The core programming language used to construct the federated learning simulation, deep neural network pipelines, differential privacy mechanisms, quantization routines, and evaluation metrics."),
        ("PyTorch 2.0+: ", "The foundational deep learning framework, providing GPU tensor acceleration, automatic differentiation, custom autograd hooks for gradient clipping, and dynamic neural network modeling."),
        ("Hugging Face Transformers: ", "Provides the pre-trained GPT-2 backbone used as the universal sequential feature extractor for multivariate time-series anomalies."),
        ("Opacus: ", "Production-grade PyTorch library developed by Meta for Differentially Private machine learning; leveraged for its fast micro-batch gradient clipping and DP-SGD accounting."),
        ("PRV Accountant (Privacy Random Variables): ", "State-of-the-art numerical privacy composition library providing exact, tight (ε, δ) privacy calculations, outperforming loose Renyi DP bounds."),
        ("FFA-LoRA (Freeze-Freezed-Adapter Low-Rank Adaptation): ", "Custom PyTorch module injecting low-rank decomposition layers (r = 8, α = 16) into self-attention projections, freezing matrix A to cut transmission payloads by ~97%."),
        ("SciPy & NumPy: ", "Used for scientific matrix calculations, Hankel matrix construction, and Singular Spectrum Analysis (SSA) during Anomaly-Driven Mask Selection."),
        ("Dynamic Post-Training Quantization (PyTorch PTQ): ", "Quantizes FP32 Linear weights into INT8 integer representations, evaluating edge compression and CPU latency."),
        ("Node.js & Express.js: ", "Scalable runtime and web application framework powering the Tier 2 API server, providing authentication, experiment management, and WebSocket streaming."),
        ("Prisma ORM & PostgreSQL: ", "Relational database layer managing schema migrations, experiment metadata, user credentials, and immutable audit trails."),
        ("React 18 & Vite: ", "Modern frontend dashboard built with TypeScript, Tailwind CSS, and Recharts, providing real-time data visualization of federated rounds, privacy budgets, and MIA leakage."),
        ("Docker & Docker-Compose: ", "Container orchestration infrastructure ensuring reproducible multi-service deployment across diverse operating systems."),
        ("Git & GitHub: ", "Version control, continuous integration, and collaborative code management.")
    ]
    for tech_title, tech_desc in tech_list:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.space_after = Pt(3)
        bp.paragraph_format.line_spacing = 1.15
        r_tt = bp.add_run(tech_title)
        r_tt.font.bold = True
        bp.add_run(tech_desc)
        
    doc.save("C:/Users/LENOVO/kmit/SentryFL/SentryFL_Project_Stage_1_Report.docx")
    print("Successfully generated SentryFL_Project_Stage_1_Report.docx")

if __name__ == "__main__":
    main()
