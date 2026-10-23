import sys
import json
import os
from datetime import datetime
import fitz

def format_ordinal_date(date_str: str) -> str:
    """Format YYYY-MM-DD into '26th October 2026'"""
    if not date_str:
        return ""
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        day = dt.day
        if 4 <= day <= 20 or 24 <= day <= 30:
            suffix = "th"
        else:
            suffix = ["st", "nd", "rd"][day % 10 - 1]
        return f"{day}{suffix} {dt.strftime('%B %Y')}"
    except Exception:
        return date_str

def generate(options: dict) -> str:
    candidate_name = options.get("candidateName", "Candidate").strip()
    job_title = options.get("jobTitle", "Team Member").strip()
    joining_date = options.get("joiningDate", "")
    employment_type = (options.get("employmentType") or "FULL_TIME").upper()
    acceptance_date = options.get("offerAcceptanceDate", "")
    template_path = options.get("templatePath")
    output_path = options.get("outputPath")
    
    is_intern = (employment_type == "INTERNSHIP")
    
    first_name = candidate_name.split()[0] if candidate_name else "Candidate"
    joining_date_text = format_ordinal_date(joining_date) or "To be communicated"
    acceptance_date_text = format_ordinal_date(acceptance_date) or "2 days after joining"
    
    doc = fitz.open(template_path)
    
    font_reg = "C:/Windows/Fonts/arial.ttf"
    font_bold = "C:/Windows/Fonts/arialbd.ttf"
    
    # -------------------------------------------------------------------------
    # PAGE 0 (First Page)
    # -------------------------------------------------------------------------
    p1 = doc[0]
    
    # 1. Title: "Offer and Appointment letter"
    p1.add_redact_annot(fitz.Rect(150, 198, 450, 230), fill=False)
    
    # 2. "To, Angel Fernandes"
    p1.add_redact_annot(fitz.Rect(23.6, 228, 450, 250), fill=False)
    
    # 3. "Subject: Appointment as Content Creator & Influencer"
    p1.add_redact_annot(fitz.Rect(23.6, 262, 570, 285), fill=False)
    
    # 4. "Dear Angel,"
    p1.add_redact_annot(fitz.Rect(23.6, 296, 350, 320), fill=False)
    
    # 5. Intro Paragraph (3 lines)
    p1.add_redact_annot(fitz.Rect(23.6, 330, 572, 388), fill=False)
    
    # 6. Section 1: Designation and Reporting (3 lines)
    p1.add_redact_annot(fitz.Rect(23.6, 435, 572, 492), fill=False)
    
    # 7. Section 2: Date of Joining
    p1.add_redact_annot(fitz.Rect(23.6, 520, 500, 544), fill=False)
    
    # 8. Section 4: Compensation line (if intern)
    if is_intern:
        p1.add_redact_annot(fitz.Rect(44.9, 645.0, 420.0, 661.5), fill=False)
        
    p1.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
    
    # Insert new text with exact size 12.6 pt
    # Title (Bold 17.5 pt centered)
    title = "Offer and Appointment letter"
    title_font = fitz.Font(fontfile=font_bold)
    title_width = title_font.text_length(title, fontsize=17.5)
    title_x = (595.5 - title_width) / 2
    p1.insert_text(fitz.Point(title_x, 222.0), title, fontfile=font_bold, fontsize=17.5, color=(0, 0, 0))
    
    # "To, " (Regular) + Candidate Name (Bold)
    p1.insert_text(fitz.Point(23.6, 244.0), "To, ", fontfile=font_reg, fontsize=12.6, color=(0, 0, 0))
    to_w = fitz.Font(fontfile=font_reg).text_length("To, ", fontsize=12.6)
    p1.insert_text(fitz.Point(23.6 + to_w, 244.0), candidate_name, fontfile=font_bold, fontsize=12.6, color=(0, 0, 0))
    
    # "Subject:" (Bold) + " Appointment as <Role>" (Regular)
    p1.insert_text(fitz.Point(23.6, 278.5), "Subject:", fontfile=font_bold, fontsize=12.6, color=(0, 0, 0))
    subj_w = fitz.Font(fontfile=font_bold).text_length("Subject:", fontsize=12.6)
    p1.insert_text(fitz.Point(23.6 + subj_w, 278.5), f" Appointment as {job_title}", fontfile=font_reg, fontsize=12.6, color=(0, 0, 0))
    
    # "Dear <First Name>," (Bold)
    p1.insert_text(fitz.Point(23.6, 313.0), f"Dear {first_name},", fontfile=font_bold, fontsize=12.6, color=(0, 0, 0))
    
    # Intro Paragraph
    intro_rect = fitz.Rect(23.6, 332.0, 571.9, 395.0)
    intro_text = (
        f"We are pleased to offer you the position of {job_title} at THRM Digital "
        f"Marketing Agency. We are confident that your skills and expertise will make a significant "
        f"contribution to the growth and success of our organization."
    )
    p1.insert_textbox(intro_rect, intro_text, fontfile=font_reg, fontsize=12.6, color=(0, 0, 0))
    
    # Section 1: Designation and Reporting
    desig_rect = fitz.Rect(23.6, 435.0, 571.9, 498.0)
    desig_text = (
        f"You will be appointed as a {job_title} and will report to the CEO, "
        f"Director, or Technology Manager. Your primary responsibility will be to lead and Manage "
        f"Web Projects and solutions for our clients."
    )
    p1.insert_textbox(desig_rect, desig_text, fontfile=font_reg, fontsize=12.6, color=(0, 0, 0))
    
    # Section 2: Date of Joining
    p1.insert_text(
        fitz.Point(23.6, 537.5),
        f"Your date of joining will be {joining_date_text}.",
        fontfile=font_reg, fontsize=12.6, color=(0, 0, 0)
    )
    
    # Section 4: Compensation (Internship)
    if is_intern:
        p1.insert_text(
            fitz.Point(44.9, 658.0),
            "Stipend: INR 7,000 (Seven Thousand) per month.",
            fontfile=font_reg, fontsize=12.6, color=(0, 0, 0)
        )
        
    # -------------------------------------------------------------------------
    # PAGE 1 (Second Page)
    # -------------------------------------------------------------------------
    p2 = doc[1]
    p2.add_redact_annot(fitz.Rect(23.6, 688, 572, 712), fill=False)
    p2.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
    p2.insert_text(
        fitz.Point(23.6, 705.5),
        f"Please sign and return a copy of this letter by {acceptance_date_text} to confirm your",
        fontfile=font_reg, fontsize=12.6, color=(0, 0, 0)
    )
    
    # -------------------------------------------------------------------------
    # PAGE 2 (Third Page)
    # -------------------------------------------------------------------------
    p3 = doc[2]
    p3.add_redact_annot(fitz.Rect(23.6, 256, 572, 280), fill=False)
    p3.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
    p3.insert_text(
        fitz.Point(23.6, 274.0),
        f"I, {candidate_name}, have read and understood the terms and conditions of this appointment",
        fontfile=font_reg, fontsize=12.6, color=(0, 0, 0)
    )
    
    if is_intern:
        render_internship_table_fitz(p3, font_reg, font_bold)
        
    doc.save(output_path)
    doc.close()
    return output_path

def render_internship_table_fitz(page, font_reg, font_bold):
    x = 23.6
    width = 548.4
    col1_w = 345
    col2_x = x + col1_w
    top_y = 378
    
    header_color = (0.525, 0.231, 0.161)
    peach_color = (0.957, 0.906, 0.886)
    alt_color = (0.984, 0.973, 0.965)
    border_color = (0.85, 0.85, 0.85)
    dark_text = (0.12, 0.12, 0.12)
    
    # White out only the table rectangle on Page 3
    page.draw_rect(fitz.Rect(x - 2, top_y, x + width + 2, top_y + 265), color=None, fill=(1, 1, 1))
    
    cur_y = top_y
    # Header 1: COMPONENT
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 20), color=None, fill=header_color)
    page.insert_text(fitz.Point(x + 16, cur_y + 14), "COMPONENT", fontfile=font_bold, fontsize=9, color=(1, 1, 1))
    page.insert_text(fitz.Point(col2_x + 25, cur_y + 14), "MONTHLY AMOUNT (INR)", fontfile=font_bold, fontsize=9, color=(1, 1, 1))
    cur_y += 20
    
    # Row 1: Basic
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 18), color=border_color, fill=(1, 1, 1), width=0.5)
    page.insert_text(fitz.Point(x + 16, cur_y + 13), "Basic Salary", fontfile=font_reg, fontsize=8.5, color=dark_text)
    page.insert_text(fitz.Point(col2_x + 50, cur_y + 13), "Rs. 3,500", fontfile=font_reg, fontsize=8.5, color=dark_text)
    cur_y += 18
    
    # Row 2: HRA
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 18), color=border_color, fill=alt_color, width=0.5)
    page.insert_text(fitz.Point(x + 16, cur_y + 13), "House Rent Allowance (HRA)", fontfile=font_reg, fontsize=8.5, color=dark_text)
    page.insert_text(fitz.Point(col2_x + 50, cur_y + 13), "Rs. 1,400", fontfile=font_reg, fontsize=8.5, color=dark_text)
    cur_y += 18
    
    # Row 3: Special Allowance
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 18), color=border_color, fill=(1, 1, 1), width=0.5)
    page.insert_text(fitz.Point(x + 16, cur_y + 13), "Special Allowance", fontfile=font_reg, fontsize=8.5, color=dark_text)
    page.insert_text(fitz.Point(col2_x + 50, cur_y + 13), "Rs. 2,100", fontfile=font_reg, fontsize=8.5, color=dark_text)
    cur_y += 18
    
    # Row 4: GROSS MONTHLY STIPEND
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 22), color=header_color, fill=peach_color, width=0.8)
    page.insert_text(fitz.Point(x + 16, cur_y + 15), "GROSS MONTHLY STIPEND", fontfile=font_bold, fontsize=9.5, color=header_color)
    page.insert_text(fitz.Point(col2_x + 50, cur_y + 15), "Rs. 7,000", fontfile=font_bold, fontsize=10, color=header_color)
    cur_y += 25
    
    # Header 2: DEDUCTIONS
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 20), color=None, fill=header_color)
    page.insert_text(fitz.Point(x + 16, cur_y + 14), "DEDUCTIONS", fontfile=font_bold, fontsize=9, color=(1, 1, 1))
    page.insert_text(fitz.Point(col2_x + 25, cur_y + 14), "MONTHLY AMOUNT (INR)", fontfile=font_bold, fontsize=9, color=(1, 1, 1))
    cur_y += 20
    
    # Row 5: PT
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 18), color=border_color, fill=(1, 1, 1), width=0.5)
    page.insert_text(fitz.Point(x + 16, cur_y + 13), "Professional Tax (PT)", fontfile=font_reg, fontsize=8.5, color=dark_text)
    page.insert_text(fitz.Point(col2_x + 55, cur_y + 13), "Rs. 100", fontfile=font_reg, fontsize=8.5, color=dark_text)
    cur_y += 18
    
    # Row 6: Insurance
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 18), color=border_color, fill=alt_color, width=0.5)
    page.insert_text(fitz.Point(x + 16, cur_y + 13), "Insurance Deduction", fontfile=font_reg, fontsize=8.5, color=dark_text)
    page.insert_text(fitz.Point(col2_x + 55, cur_y + 13), "Rs. 150", fontfile=font_reg, fontsize=8.5, color=dark_text)
    cur_y += 18
    
    # Row 7: TOTAL DEDUCTIONS
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 22), color=header_color, fill=peach_color, width=0.8)
    page.insert_text(fitz.Point(x + 16, cur_y + 15), "TOTAL DEDUCTIONS", fontfile=font_bold, fontsize=9.5, color=header_color)
    page.insert_text(fitz.Point(col2_x + 55, cur_y + 15), "Rs. 250", fontfile=font_bold, fontsize=10, color=header_color)
    cur_y += 26
    
    # Row 8: NET IN-HAND STIPEND
    page.draw_rect(fitz.Rect(x, cur_y, x + width, cur_y + 26), color=header_color, fill=peach_color, width=1.0)
    page.insert_text(fitz.Point(x + 16, cur_y + 18), "NET IN-HAND STIPEND", fontfile=font_bold, fontsize=11, color=header_color)
    page.insert_text(fitz.Point(col2_x + 20, cur_y + 18), "Rs. 6,750 per month", fontfile=font_bold, fontsize=11.5, color=header_color)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        raw_json = sys.argv[1]
        opts = json.loads(raw_json)
        res = generate(opts)
        print(f"SUCCESS:{res}")
    else:
        print("Usage: python generate_appointment_letter.py '<json_string>'")
