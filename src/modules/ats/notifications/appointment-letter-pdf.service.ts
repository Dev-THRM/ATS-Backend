import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const execFileAsync = promisify(execFile);

export interface GenerateAppointmentLetterOptions {
  candidateName: string;
  jobTitle: string;
  companyName?: string;
  joiningDate?: string;
  employmentType?: string;
  offerAcceptanceDate?: string;
  compensation?: {
    grossMonthly: number;
    netMonthly: number;
    breakdown: {
      basic: number;
      hra: number;
      specialAllowance: number;
    };
    deductions: {
      professionalTax: number;
      insurance: number;
      total: number;
    };
  };
}

@Injectable()
export class AppointmentLetterPdfService {
  private readonly logger = new Logger(AppointmentLetterPdfService.name);

  /**
   * Generates the official 3-page THRM appointment letter PDF buffer
   * using the authentic template as the baseline, updating candidate
   * dynamic fields with exact positioning and zero white patches.
   */
  async generatePdfBuffer(options: GenerateAppointmentLetterOptions): Promise<Buffer> {
    const templatePath = this.resolveTemplatePath();
    const candidateFullName = (options.candidateName || 'Candidate').trim();

    // 1. Primary: PyMuPDF Seamless Generator (Zero white patches, exact Canva typography)
    const scriptPath = this.resolvePythonScriptPath();
    if (scriptPath && fs.existsSync(scriptPath)) {
      const tempOutput = path.join(
        os.tmpdir(),
        `appt_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`,
      );
      try {
        await execFileAsync('python', [
          scriptPath,
          JSON.stringify({
            candidateName: candidateFullName,
            jobTitle: options.jobTitle,
            joiningDate: options.joiningDate,
            employmentType: options.employmentType,
            offerAcceptanceDate: options.offerAcceptanceDate,
            templatePath,
            outputPath: tempOutput,
          }),
        ]);

        if (fs.existsSync(tempOutput)) {
          const pdfBytes = fs.readFileSync(tempOutput);
          try {
            fs.unlinkSync(tempOutput);
          } catch {}
          this.logger.log(
            `Generated seamless appointment letter PDF via PyMuPDF for ${candidateFullName} (${pdfBytes.length} bytes)`,
          );
          return pdfBytes;
        }
      } catch (pyErr: any) {
        this.logger.warn(`PyMuPDF generator failed, falling back to pdf-lib: ${pyErr.message}`);
      }
    }

    try {
      const templateBytes = fs.readFileSync(templatePath);
      const doc = await PDFDocument.load(templateBytes);

      const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

      const isIntern =
        options.employmentType?.toLowerCase() === 'internship' ||
        options.employmentType?.toLowerCase() === 'intern';

      const candidateFullName = (options.candidateName || 'Candidate').trim();
      const candidateFirstName = candidateFullName.split(' ')[0] || candidateFullName;
      const roleTitle = (options.jobTitle || 'Executive').trim();

      const joiningDateText = options.joiningDate
        ? this.formatDisplayDate(options.joiningDate)
        : '13th October 2026';

      const acceptanceDateText = options.offerAcceptanceDate
        ? this.formatDisplayDate(options.offerAcceptanceDate)
        : this.resolveAcceptanceDate(options.joiningDate);

      const p1 = doc.getPage(0);
      const p2 = doc.getPage(1);
      const p3 = doc.getPage(2);

      // =========================================================================
      // PAGE 1 OVERLAYS
      // =========================================================================

      // 0. Document Title: "Offer and Appointment letter"
      p1.drawRectangle({
        x: 100,
        y: 622,
        width: 395,
        height: 26,
        color: rgb(1, 1, 1),
      });
      const titleText = 'Offer and Appointment letter';
      const titleSize = 16;
      const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
      const titleX = (595.5 - titleWidth) / 2;
      p1.drawText(titleText, {
        x: titleX,
        y: 628,
        size: titleSize,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // 1. "To, <Candidate Name>"
      p1.drawRectangle({
        x: 20,
        y: 600,
        width: 350,
        height: 20,
        color: rgb(1, 1, 1),
      });
      p1.drawText('To, ', {
        x: 23.6,
        y: 605.9,
        size: 10.5,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
      });
      const toWidth = fontRegular.widthOfTextAtSize('To, ', 10.5);
      p1.drawText(candidateFullName, {
        x: 23.6 + toWidth,
        y: 605.9,
        size: 10.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // 2. "Subject: Appointment as <Role Title>"
      p1.drawRectangle({
        x: 20,
        y: 566,
        width: 530,
        height: 20,
        color: rgb(1, 1, 1),
      });
      p1.drawText('Subject', {
        x: 23.6,
        y: 571.4,
        size: 10.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      const subjWidth = fontBold.widthOfTextAtSize('Subject', 10.5);
      p1.drawText(`: Appointment as ${roleTitle}`, {
        x: 23.6 + subjWidth,
        y: 571.4,
        size: 10.5,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
      });

      // 3. "Dear <First Name>,"
      p1.drawRectangle({
        x: 20,
        y: 531,
        width: 300,
        height: 20,
        color: rgb(1, 1, 1),
      });
      p1.drawText(`Dear ${candidateFirstName},`, {
        x: 23.6,
        y: 536.9,
        size: 10.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // 4. Offer intro paragraph
      p1.drawRectangle({
        x: 20,
        y: 462,
        width: 550,
        height: 56,
        color: rgb(1, 1, 1),
      });
      p1.drawText(
        `We are pleased to offer you the position of ${roleTitle} at THRM Digital Marketing Agency.`,
        {
          x: 23.6,
          y: 502.4,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p1.drawText(
        'We are confident that your skills and expertise will make a significant contribution to the growth',
        {
          x: 23.6,
          y: 485.1,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p1.drawText('and success of our organization.', {
        x: 23.6,
        y: 467.9,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // 5. Section 1: Designation and Reporting
      p1.drawRectangle({
        x: 20,
        y: 358,
        width: 550,
        height: 52,
        color: rgb(1, 1, 1),
      });
      p1.drawText(
        `You will be appointed as a ${roleTitle} and will report to the CEO, Director, or Technology Manager.`,
        {
          x: 23.6,
          y: 398.8,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p1.drawText(
        'Your primary responsibility will be to lead and Manage Web Projects and solutions for our clients.',
        {
          x: 23.6,
          y: 381.6,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );

      // 6. Section 2: Date of Joining
      p1.drawRectangle({
        x: 20,
        y: 306,
        width: 550,
        height: 20,
        color: rgb(1, 1, 1),
      });
      p1.drawText(`Your date of joining will be ${joiningDateText}.`, {
        x: 23.6,
        y: 312.6,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // 7. Section 4: Compensation line
      p1.drawRectangle({
        x: 40,
        y: 186,
        width: 450,
        height: 18,
        color: rgb(1, 1, 1),
      });
      const compLineText = isIntern
        ? 'Stipend: INR 7,000 (Seven Thousand) per month.'
        : 'Salary: INR 15,000 (Fifteen Thousand) per month.';
      p1.drawText(compLineText, {
        x: 44.9,
        y: 191.8,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // =========================================================================
      // PAGE 2 OVERLAYS
      // =========================================================================

      // Section 9: Acceptance of Offer deadline
      p2.drawRectangle({
        x: 20,
        y: 122,
        width: 550,
        height: 30,
        color: rgb(1, 1, 1),
      });
      p2.drawText(
        `Please sign and return a copy of this letter by ${acceptanceDateText} to confirm your`,
        {
          x: 23.6,
          y: 144.8,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p2.drawText('acceptance of the terms and conditions outlined above.', {
        x: 23.6,
        y: 127.5,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // =========================================================================
      // PAGE 3 OVERLAYS
      // =========================================================================

      // 1. Acceptance Declaration with candidate name
      p3.drawRectangle({
        x: 20,
        y: 535,
        width: 550,
        height: 50,
        color: rgb(1, 1, 1),
      });
      p3.drawText(
        `I, ${candidateFullName}, have read and understood the terms and conditions of this appointment`,
        {
          x: 23.6,
          y: 576.0,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p3.drawText(
        'letter and accept the same. I agree to abide by the policies and guidelines of THRM Digital',
        {
          x: 23.6,
          y: 558.8,
          size: 10.2,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        },
      );
      p3.drawText('Marketing Agency.', {
        x: 23.6,
        y: 541.5,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // 2. Candidate Name under Signature
      p3.drawRectangle({
        x: 20,
        y: 485,
        width: 300,
        height: 18,
        color: rgb(1, 1, 1),
      });
      p3.drawText(`Name: ${candidateFullName}`, {
        x: 23.6,
        y: 489.8,
        size: 10.2,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      // 3. Compensation Breakdown Table on Page 3
      // If internship: Overlay the table with the 7k stipend breakdown
      if (isIntern) {
        this.renderInternshipTable(p3, fontRegular, fontBold, fontOblique);
      }
      // If full_time: The template already contains the exact 15k breakdown table!

      const pdfBytes = await doc.save();
      this.logger.log(
        `Generated dynamic appointment letter PDF for ${candidateFullName} (${pdfBytes.length} bytes)`,
      );
      return Buffer.from(pdfBytes);
    } catch (err: any) {
      this.logger.error(`Failed to generate appointment letter PDF: ${err.message}`, err.stack);
      throw err;
    }
  }

  private renderInternshipTable(
    page: any,
    fontRegular: any,
    fontBold: any,
    fontOblique: any,
  ) {
    const x = 23.6;
    const width = 548.4;
    const topY = 442;
    const col1W = 345;
    const col2X = x + col1W;

    // White out original 15k table
    page.drawRectangle({
      x: x - 2,
      y: 170,
      width: width + 4,
      height: 275,
      color: rgb(1, 1, 1),
    });

    const headerColor = rgb(0.525, 0.231, 0.161); // #863B29 terracotta
    const peachColor = rgb(0.957, 0.906, 0.886); // #F4E7E2 light peach
    const altColor = rgb(0.984, 0.973, 0.965);
    const borderColor = rgb(0.85, 0.85, 0.85);
    const darkTextColor = rgb(0.12, 0.12, 0.12);

    let curY = topY;

    // Header 1: COMPONENT
    page.drawRectangle({ x, y: curY - 20, width, height: 20, color: headerColor });
    page.drawText('COMPONENT', {
      x: x + 16,
      y: curY - 14,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('MONTHLY AMOUNT (INR)', {
      x: col2X + 25,
      y: curY - 14,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    curY -= 20;

    // Row 1: Basic Salary
    page.drawRectangle({
      x,
      y: curY - 18,
      width,
      height: 18,
      color: rgb(1, 1, 1),
      borderColor,
      borderWidth: 0.5,
    });
    page.drawText('Basic Salary', {
      x: x + 16,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    page.drawText('Rs. 3,500', {
      x: col2X + 50,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    curY -= 18;

    // Row 2: HRA
    page.drawRectangle({
      x,
      y: curY - 18,
      width,
      height: 18,
      color: altColor,
      borderColor,
      borderWidth: 0.5,
    });
    page.drawText('House Rent Allowance (HRA)', {
      x: x + 16,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    page.drawText('Rs. 1,400', {
      x: col2X + 50,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    curY -= 18;

    // Row 3: Special Allowance
    page.drawRectangle({
      x,
      y: curY - 18,
      width,
      height: 18,
      color: rgb(1, 1, 1),
      borderColor,
      borderWidth: 0.5,
    });
    page.drawText('Special Allowance', {
      x: x + 16,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    page.drawText('Rs. 2,100', {
      x: col2X + 50,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    curY -= 18;

    // Row 4: GROSS MONTHLY STIPEND
    page.drawRectangle({
      x,
      y: curY - 22,
      width,
      height: 22,
      color: peachColor,
      borderColor: headerColor,
      borderWidth: 0.8,
    });
    page.drawText('GROSS MONTHLY STIPEND', {
      x: x + 16,
      y: curY - 15,
      size: 9.5,
      font: fontBold,
      color: headerColor,
    });
    page.drawText('Rs. 7,000', {
      x: col2X + 50,
      y: curY - 15,
      size: 10,
      font: fontBold,
      color: headerColor,
    });
    curY -= 25;

    // Header 2: DEDUCTIONS
    page.drawRectangle({ x, y: curY - 20, width, height: 20, color: headerColor });
    page.drawText('DEDUCTIONS', {
      x: x + 16,
      y: curY - 14,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('MONTHLY AMOUNT (INR)', {
      x: col2X + 25,
      y: curY - 14,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    curY -= 20;

    // Row 5: PT
    page.drawRectangle({
      x,
      y: curY - 18,
      width,
      height: 18,
      color: rgb(1, 1, 1),
      borderColor,
      borderWidth: 0.5,
    });
    page.drawText('Professional Tax (PT)', {
      x: x + 16,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    page.drawText('Rs. 100', {
      x: col2X + 55,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    curY -= 18;

    // Row 6: Insurance Deduction
    page.drawRectangle({
      x,
      y: curY - 18,
      width,
      height: 18,
      color: altColor,
      borderColor,
      borderWidth: 0.5,
    });
    page.drawText('Insurance Deduction', {
      x: x + 16,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    page.drawText('Rs. 150', {
      x: col2X + 55,
      y: curY - 13,
      size: 8.5,
      font: fontRegular,
      color: darkTextColor,
    });
    curY -= 18;

    // Row 7: TOTAL DEDUCTIONS
    page.drawRectangle({
      x,
      y: curY - 22,
      width,
      height: 22,
      color: peachColor,
      borderColor: headerColor,
      borderWidth: 0.8,
    });
    page.drawText('TOTAL DEDUCTIONS', {
      x: x + 16,
      y: curY - 15,
      size: 9.5,
      font: fontBold,
      color: headerColor,
    });
    page.drawText('Rs. 250', {
      x: col2X + 55,
      y: curY - 15,
      size: 10,
      font: fontBold,
      color: headerColor,
    });
    curY -= 26;

    // Row 8: NET IN-HAND STIPEND
    page.drawRectangle({
      x,
      y: curY - 26,
      width,
      height: 26,
      color: peachColor,
      borderColor: headerColor,
      borderWidth: 1,
    });
    page.drawText('NET IN-HAND STIPEND', {
      x: x + 16,
      y: curY - 17,
      size: 11,
      font: fontBold,
      color: headerColor,
    });
    page.drawText('Rs. 6,750 per month', {
      x: col2X + 20,
      y: curY - 17,
      size: 11.5,
      font: fontBold,
      color: headerColor,
    });
    curY -= 32;

    page.drawText(
      'Salary figures are monthly. Professional tax may vary where applicable under state rules.',
      {
        x: x,
        y: curY,
        size: 7.2,
        font: fontOblique,
        color: rgb(0.4, 0.4, 0.4),
      },
    );
  }

  private resolvePythonScriptPath(): string | null {
    const candidates = [
      path.join(process.cwd(), 'scripts/generate_appointment_letter.py'),
      path.resolve('e:/ATS/ATS-Backend/scripts/generate_appointment_letter.py'),
      path.join(__dirname, '../../../../scripts/generate_appointment_letter.py'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }

    return null;
  }

  private resolveTemplatePath(): string {
    const candidates = [
      path.join(process.cwd(), 'src/assets/templates/appointment-letter-template.pdf'),
      path.join(process.cwd(), 'dist/assets/templates/appointment-letter-template.pdf'),
      path.resolve('e:/ATS/ATS-Backend/src/assets/templates/appointment-letter-template.pdf'),
      'C:/Users/SAHIL/.gemini/antigravity-ide/brain/749849f6-3b41-41e9-b5f5-9783306329d8/.user_uploaded/media_1792656523098.pdf',
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }

    throw new Error('Appointment letter template PDF not found');
  }

  private formatDisplayDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      const day = date.getDate();
      const suffix =
        day === 1 || day === 21 || day === 31
          ? 'st'
          : day === 2 || day === 22
            ? 'nd'
            : day === 3 || day === 23
              ? 'rd'
              : 'th';

      const month = date.toLocaleDateString('en-US', { month: 'long' });
      const year = date.getFullYear();

      return `${day}${suffix} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  }

  private resolveAcceptanceDate(joiningDateStr?: string): string {
    try {
      if (joiningDateStr) {
        const d = new Date(joiningDateStr);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 2);
          const day = d.getDate();
          const suffix =
            day === 1 || day === 21 || day === 31
              ? 'st'
              : day === 2 || day === 22
                ? 'nd'
                : day === 3 || day === 23
                  ? 'rd'
                  : 'th';
          const month = d.toLocaleDateString('en-US', { month: 'long' });
          const year = d.getFullYear();
          return `${day}${suffix} ${month} ${year}`;
        }
      }
    } catch {
      // fallback
    }
    return '15th October 2026';
  }
}
