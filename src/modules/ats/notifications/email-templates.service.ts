import { Injectable } from '@nestjs/common';

export interface EmailTemplateParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName?: string;
  rejectionReason?: string | null;
  customNotes?: string | null;
  joiningDate?: string | null;
  employmentType?: string | null;
  offerAcceptanceDate?: string | null;
  compensation?: any | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailTemplatesService {
  /**
   * Dispatches the appropriate email template based on stage name, clearance, or rejection.
   */
  renderStageEmail(params: EmailTemplateParams): RenderedEmail {
    const { stageName = '', rejectionReason } = params;
    const normalizedStage = stageName.trim().toLowerCase();

    // 1. Rejection / Fails HR round
    if (
      normalizedStage.includes('reject') ||
      normalizedStage.includes('fail') ||
      normalizedStage.includes('declined') ||
      Boolean(rejectionReason)
    ) {
      return this.renderRejectionEmail(params);
    }

    // 2. Cleared HR round / Offer extended / Hired
    if (
      normalizedStage.includes('offer') ||
      normalizedStage.includes('hired') ||
      normalizedStage.includes('selected') ||
      normalizedStage.includes('cleared') ||
      normalizedStage.includes('clears') ||
      normalizedStage.includes('passed')
    ) {
      return this.renderOfferEmail(params);
    }

    // 3. Application Submission confirmation (applied, candidate created, talent pool)
    if (
      normalizedStage.includes('applied') ||
      normalizedStage.includes('application') ||
      normalizedStage.includes('new') ||
      normalizedStage.includes('sourced') ||
      normalizedStage.includes('review') ||
      normalizedStage.includes('talent')
    ) {
      return this.renderApplicationReceivedEmail(params);
    }

    // 4. Default interview / stage progression (e.g. HR Round, Technical Round, Final Interview)
    return this.renderStageProgressEmail(params);
  }

  /**
   * Template: Candidate applied for a particular position
   */
  renderApplicationReceivedEmail(params: EmailTemplateParams): RenderedEmail {
    const { candidateName, jobTitle, companyName } = params;
    const subject = `Application Received: ${jobTitle} at ${companyName}`;

    const text = `Dear ${candidateName},

Thank you for applying for the ${jobTitle} position at ${companyName}.

We have successfully received your application, background profile, and resume. Our recruitment and talent acquisition team is actively reviewing applications.

If your qualifications and experience align with our requirements, our hiring team will reach out directly with details regarding the next interview round.

Thank you again for your interest in joining ${companyName}.

Best regards,
Talent Acquisition Team
${companyName}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 32px 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                ${companyName}
              </h2>
              <p style="margin: 6px 0 0 0; color: #dbeafe; font-size: 14px; font-weight: 500;">
                Application Acknowledgment
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Thank you for applying for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We have received your application along with your submitted profile and resume. Our hiring team is currently evaluating submissions to shortlist candidates whose qualifications align with the role requirements.
              </p>

              <!-- Highlight Callout Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; margin: 24px 0;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Applied Position</div>
                    <div style="font-size: 16px; font-weight: 800; color: #1e3a8a;">${jobTitle}</div>
                    <div style="font-size: 13px; color: #3b82f6; margin-top: 2px;">Company: ${companyName}</div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                If your background matches what we are looking for, a member of our talent acquisition team will reach out with next steps and scheduling details for upcoming interview rounds.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We appreciate the time and interest you have invested in exploring a career with us!
              </p>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Talent Acquisition Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${companyName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                This is an automated notification from ${companyName} Talent Acquisition System.<br>
                Please do not reply directly to this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }

  /**
   * Template: Candidate clears HR round / Hired -> Official Appointment Letter & Offer Email
   */
  renderOfferEmail(params: EmailTemplateParams): RenderedEmail {
    const {
      candidateName,
      jobTitle,
      companyName,
      joiningDate,
      offerAcceptanceDate,
    } = params;

    let formattedJoiningDate = '';
    if (joiningDate) {
      try {
        const d = new Date(joiningDate);
        if (!isNaN(d.getTime())) {
          formattedJoiningDate = d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        } else {
          formattedJoiningDate = joiningDate;
        }
      } catch {
        formattedJoiningDate = joiningDate;
      }
    }

    let formattedAcceptanceDate = '';
    if (offerAcceptanceDate) {
      try {
        const d = new Date(offerAcceptanceDate);
        if (!isNaN(d.getTime())) {
          const day = d.getDate();
          const suffix =
            day === 1 || day === 21 || day === 31
              ? 'st'
              : day === 2 || day === 22
                ? 'nd'
                : day === 3 || day === 23
                  ? 'rd'
                  : 'th';
          const monthYear = d.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          });
          formattedAcceptanceDate = `${day}${suffix} ${monthYear}`;
        }
      } catch {
        formattedAcceptanceDate = offerAcceptanceDate;
      }
    } else if (joiningDate) {
      try {
        const d = new Date(joiningDate);
        if (!isNaN(d.getTime())) {
          const returnDate = new Date(d);
          returnDate.setDate(returnDate.getDate() + 2);
          const day = returnDate.getDate();
          const suffix =
            day === 1 || day === 21 || day === 31
              ? 'st'
              : day === 2 || day === 22
                ? 'nd'
                : day === 3 || day === 23
                  ? 'rd'
                  : 'th';
          const monthYear = returnDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          });
          formattedAcceptanceDate = `${day}${suffix} ${monthYear}`;
        }
      } catch {
        // fallback
      }
    }

    const subject = `Offer and Appointment letter: ${jobTitle} | ${companyName || 'THRM Digital Marketing Agency'}`;

    const text = `Dear ${candidateName},

Congratulations! We are pleased to extend you an offer for the position of ${jobTitle} at ${companyName || 'THRM Digital Marketing Agency'}.

Please find your official Offer and Appointment letter attached to this email as a PDF. Kindly review, sign, and return a copy within 2 days of joining${formattedAcceptanceDate ? ` (on or before ${formattedAcceptanceDate})` : ''} to confirm your acceptance.

We look forward to welcoming you to the team!

Warm regards,
HR & Recruitment Team
${companyName || 'THRM Digital Marketing Agency'}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <!-- Top Accent Line -->
          <tr>
            <td style="height: 4px; background: #8C3A27;"></td>
          </tr>
          <!-- Body Content (Simple 2-3 lines) -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; color: #8C3A27; font-size: 20px; font-weight: 700;">
                Congratulations, ${candidateName}!
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We are pleased to extend you an offer for the position of <strong>${jobTitle}</strong> at <strong>${companyName || 'THRM Digital Marketing Agency'}</strong>.
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Please find your official <strong>Offer and Appointment letter attached to this email as a PDF</strong>. Kindly review the details, sign, and return a copy within 2 days of joining${formattedAcceptanceDate ? ` (on or before <strong>${formattedAcceptanceDate}</strong>)` : ''} to confirm your acceptance.
              </p>
              <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We are excited to welcome you to our team and look forward to having you onboard!
              </p>
              <!-- Signoff -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">Warm regards,</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                  HR &amp; Recruitment Team<br>
                  <strong>${companyName || 'THRM Digital Marketing Agency'}</strong>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    return { subject, html, text };
  }

  /**
   * Template: Candidate fails HR round / stage -> Rejection Template ("So Sorry")
   */
  renderRejectionEmail(params: EmailTemplateParams): RenderedEmail {
    const { candidateName, jobTitle, companyName, rejectionReason } = params;
    const subject = `Update regarding your application for ${jobTitle} at ${companyName}`;

    const text = `Dear ${candidateName},

Thank you for your time and interest in the ${jobTitle} position at ${companyName}.

We are writing to inform you that, after careful consideration and review of our hiring requirements, we have decided to move forward with other candidates at this time. We are so sorry that we cannot offer you positive news for this role.

${rejectionReason ? `Feedback from HR: ${rejectionReason}\n\n` : ''}
We truly appreciate the time and effort you dedicated to interviewing with us. We were impressed by your background and will retain your resume in our talent network for future opportunities that align with your profile.

We wish you the very best in your job search and your ongoing career endeavors.

Sincerely,
Talent Acquisition Team
${companyName}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #334155; padding: 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">
                ${companyName}
              </h2>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">
                Application Status Update
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Thank you so much for taking the time to interview and engage with us regarding the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We received applications from many accomplished professionals, making our hiring decisions especially difficult. After careful review of our current team needs and role priorities, <strong>we are so sorry to inform you</strong> that we will not be moving forward with your candidacy at this time.
              </p>

              ${
                rejectionReason
                  ? `
              <!-- Optional Constructive Feedback Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; margin: 20px 0;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #be123c; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Recruiter Feedback</div>
                    <div style="font-size: 13px; color: #881337; line-height: 1.5;">${rejectionReason}</div>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }

              <p style="margin: 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Please know that this decision does not diminish your impressive background or strengths. We will keep your profile in our active talent pool, and should an opportunity open that closely aligns with your qualifications, we would be glad to reach out to you.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We sincerely wish you the best of luck with your job search and all your future professional endeavors.
              </p>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Talent Acquisition Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${companyName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }

  /**
   * Template: Candidate progressed to another stage (e.g. Screening, Tech Interview)
   */
  renderStageProgressEmail(params: EmailTemplateParams): RenderedEmail {
    const { candidateName, jobTitle, companyName, stageName = 'Next Round', customNotes } = params;
    const subject = `Application Update: ${stageName} for ${jobTitle} at ${companyName}`;

    const text = `Dear ${candidateName},

Great news! Your application for the ${jobTitle} position at ${companyName} has progressed to the ${stageName} stage.

${customNotes ? `Note: ${customNotes}\n\n` : ''}
Our recruiting team will contact you shortly with further scheduling information and next steps.

Best regards,
Talent Acquisition Team
${companyName}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 32px 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                ${companyName}
              </h2>
              <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 14px; font-weight: 500;">
                Application Stage Update
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Great news! Your application for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> has successfully advanced to the <strong>${stageName}</strong> stage.
              </p>
              ${
                customNotes
                  ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0;">
                <tr>
                  <td style="padding: 16px;">
                    <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">Recruiter Note</div>
                    <div style="font-size: 14px; color: #334155; margin-top: 4px; line-height: 1.5;">${customNotes}</div>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Our hiring team will be in touch shortly with next steps and scheduling details.
              </p>
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Talent Acquisition Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${companyName}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }

  /**
   * Template: Candidate invited to an interview (Online Google Meet or Offline In-Person)
   */
  renderInterviewInvitationEmail(params: InterviewEmailParams): RenderedEmail {
    const {
      candidateName,
      jobTitle,
      companyName,
      interviewTitle,
      scheduledAt,
      durationMinutes = 45,
      meetingLink,
      locationNotes,
    } = params;

    const dateObj = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    const dateStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : String(scheduledAt);

    const isOnline = Boolean(meetingLink && meetingLink.trim());
    const subject = `Interview Invitation: ${interviewTitle} - ${jobTitle} at ${companyName}`;

    const text = isOnline
      ? `Dear ${candidateName},

We are pleased to invite you for the ${interviewTitle} for the ${jobTitle} position at ${companyName}.

Interview Details:
- Session: ${interviewTitle}
- Position: ${jobTitle}
- Date & Time: ${dateStr}
- Duration: ${durationMinutes} minutes
- Format: Online Video Meeting
- Google Meet Link: ${meetingLink}
${locationNotes ? `- Instructions: ${locationNotes}\n` : ''}
Please join 5 minutes before the scheduled time with your camera and microphone enabled.

If you have any questions or need to reschedule, please reply directly to this email.

Best regards,
Talent Acquisition Team
${companyName}`
      : `Dear ${candidateName},

We are pleased to invite you for an in-person interview for the ${jobTitle} position at ${companyName}.

Interview Details:
- Session: ${interviewTitle}
- Position: ${jobTitle}
- Date & Time: ${dateStr}
- Duration: ${durationMinutes} minutes
- Format: Offline / In-Person
${locationNotes ? `- Venue / Instructions: ${locationNotes}\n` : '- Venue: Please report to the office reception 10 minutes prior to the scheduled time.\n'}
Please arrive 10 minutes before the scheduled time with your ID and a copy of your resume.

If you have any questions or need to reschedule, please reply directly to this email.

Best regards,
Talent Acquisition Team
${companyName}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 32px 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                ${companyName}
              </h2>
              <p style="margin: 6px 0 0 0; color: #dbeafe; font-size: 14px; font-weight: 500;">
                Interview Invitation
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We are pleased to invite you for the <strong>${interviewTitle}</strong> for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.
              </p>

              <!-- Session Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="6" cellspacing="0" border="0">
                      <tr>
                        <td width="30%" style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Session</td>
                        <td style="font-size: 14px; font-weight: 700; color: #0f172a;">${interviewTitle}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Position</td>
                        <td style="font-size: 14px; color: #334155;">${jobTitle}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Date & Time</td>
                        <td style="font-size: 14px; font-weight: 600; color: #2563eb;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Duration</td>
                        <td style="font-size: 14px; color: #334155;">${durationMinutes} minutes</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Format</td>
                        <td style="font-size: 14px; font-weight: 700; color: ${isOnline ? '#2563eb' : '#059669'};">
                          ${isOnline ? 'Online (Google Meet)' : 'Offline / In-Person'}
                        </td>
                      </tr>
                      ${
                        isOnline && meetingLink
                          ? `
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Meeting Link</td>
                        <td style="font-size: 14px; word-break: break-all;">
                          <a href="${meetingLink}" target="_blank" style="color: #2563eb; font-weight: 600; text-decoration: underline;">
                            ${meetingLink}
                          </a>
                        </td>
                      </tr>
                      `
                          : ''
                      }
                      ${
                        locationNotes
                          ? `
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Instructions</td>
                        <td style="font-size: 13px; color: #475569; line-height: 1.5;">${locationNotes}</td>
                      </tr>
                      `
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              ${
                isOnline && meetingLink
                  ? `
              <div style="text-align: center; margin: 28px 0;">
                <a href="${meetingLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                  Join Video Meeting
                </a>
              </div>
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b; text-align: center;">
                Please ensure you have a working camera and microphone before joining.
              </p>
              `
                  : `
              <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
                <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
                  <strong>In-Person Reporting:</strong> Please arrive 10 minutes prior to the scheduled time with your photo ID and updated resume.
                </p>
              </div>
              `
              }

              <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.6; color: #475569;">
                If you have any questions or need to reschedule, please feel free to reply directly to this email. We look forward to meeting you!
              </p>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Talent Acquisition Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${companyName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.<br>
                Official communication regarding your job application.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }

  /**
   * Template: Admin notification email sent to dev@thrmdigitalmarketing.in when a visitor
   * submits the "Request Custom Walkthrough & Quote" form on the ATS landing page.
   */
  renderContactInquiryAdminEmail(params: ContactInquiryEmailParams): RenderedEmail {
    const { name, email, company, phone, message } = params;
    const companyDisplay = company?.trim() || 'Organization Not Specified';
    const subject = `New Inquiry: Walkthrough & Quote Request - ${name} (${companyDisplay})`;

    const text = `NEW ENTERPRISE INQUIRY: THRM ATS WALKTHROUGH & QUOTE

A new request has been submitted through the ATS portal.

Contact Details:
- Name: ${name}
- Work Email: ${email}
- Company: ${companyDisplay}
- Phone: ${phone?.trim() || 'Not provided'}
- Requirements: ${message?.trim() || 'No additional requirements provided'}

Submitted At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
Guaranteed SLA Response: Under 2 Hours

--
THRM Universe ATS Inbound Notification Engine`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e51da, #2563eb); padding: 32px 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                THRM ATS
              </h2>
              <p style="margin: 6px 0 0 0; color: #dbeafe; font-size: 14px; font-weight: 500;">
                New Walkthrough & Custom Quote Request
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Hello Team,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                A new inquiry has been submitted via the <strong>Request Custom Walkthrough & Quote</strong> form on the THRM ATS website.
              </p>

              <!-- Inquiry Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="8" cellspacing="0" border="0">
                      <tr>
                        <td width="32%" style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Full Name</td>
                        <td style="font-size: 14px; font-weight: 700; color: #0f172a;">${name}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Work Email</td>
                        <td style="font-size: 14px;">
                          <a href="mailto:${email}" style="color: #1e51da; font-weight: 700; text-decoration: none;">${email}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Company</td>
                        <td style="font-size: 14px; font-weight: 600; color: #334155;">${companyDisplay}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Phone / WhatsApp</td>
                        <td style="font-size: 14px; color: #334155;">
                          ${
                            phone?.trim()
                              ? `<a href="tel:${phone}" style="color: #1e51da; font-weight: 600; text-decoration: none;">${phone}</a>`
                              : '<span style="color: #94a3b8; font-style: italic;">Not provided</span>'
                          }
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; vertical-align: top;">Requirements</td>
                        <td style="font-size: 13px; color: #334155; line-height: 1.5;">
                          ${message?.trim() || '<span style="color: #94a3b8; font-style: italic;">None specified</span>'}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Quick Action Button -->
              <div style="text-align: center; margin: 28px 0 20px 0;">
                <a href="mailto:${email}?subject=RE: THRM ATS Custom Walkthrough & Quote" style="background-color: #1e51da; color: #ffffff; padding: 12px 30px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 6px -1px rgba(30,81,218,0.25);">
                  Reply to ${name} (${email})
                </a>
              </div>

              <!-- SLA Target Box -->
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
                <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
                  <strong>⚡ Guaranteed SLA:</strong> Under 2 Hours. Connect with this inquiry to schedule the 15-minute live demo.
                </p>
              </div>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Inbound Solutions Engine</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">THRM Universe ATS</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} THRM Universe ATS. Internal notification for dev@thrmdigitalmarketing.in.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }

  /**
   * Template: Acknowledgment email sent to the user who requested a custom walkthrough & quote.
   */
  renderContactInquiryAcknowledgmentEmail(params: ContactInquiryEmailParams): RenderedEmail {
    const { name, company, email, phone } = params;
    const companyDisplay = company?.trim() || 'your organization';
    const subject = `Inquiry Received: Custom Walkthrough & Proposal - THRM ATS`;

    const text = `Dear ${name},

Thank you for your interest in THRM ATS!

We have successfully received your request for a customized product walkthrough and proposal for ${companyDisplay}.

Our solutions architects are reviewing your requirements and will reach out to you within 2 hours at ${email}${phone ? ` or ${phone}` : ''}.

What to expect in your 15-Minute Live Walkthrough:
- Live demonstration of AI Resume Parsing on your actual job descriptions & resumes
- Interactive drag-and-drop Kanban pipeline setup
- Structured interview scorecard and team feedback workflows
- Transparent quotation customized for your hiring requirements

If you need urgent assistance, feel free to reply directly to this email.

Best regards,
Talent Solutions Team
THRM Universe ATS`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e51da, #2563eb); padding: 32px 28px; text-align: left;">
              <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">
                THRM ATS
              </h2>
              <p style="margin: 6px 0 0 0; color: #dbeafe; font-size: 14px; font-weight: 500;">
                Walkthrough & Proposal Request Acknowledged
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Dear <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Thank you for your interest in <strong>THRM ATS</strong>. We have received your request for a personalized product demonstration and custom proposal for <strong>${companyDisplay}</strong>.
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Our talent solutions team is reviewing your requirements and will connect with you at <strong>${email}</strong>${phone ? ` (or ${phone})` : ''} within <strong>2 hours</strong>.
              </p>

              <!-- Highlight Callout Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Your Inquiry Summary</div>
                    <div style="font-size: 15px; font-weight: 700; color: #1e3a8a;">
                      ${companyDisplay}
                    </div>
                    <div style="font-size: 13px; color: #3b82f6; margin-top: 4px;">
                      Guaranteed SLA: Response within 2 hours
                    </div>
                  </td>
                </tr>
              </table>

              <!-- What to Expect -->
              <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #0f172a;">
                What to expect during your 15-Minute Live Walkthrough:
              </p>
              <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #475569;">
                <li>Test AI Resume Parsing live on your real job descriptions & candidate resumes</li>
                <li>Tour the visual drag-and-drop Kanban pipeline & automated interview stages</li>
                <li>Review structured evaluation scorecards and interviewer collaboration tools</li>
                <li>Receive a transparent quotation customized for your hiring requirements</li>
              </ul>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                If you have urgent questions or custom contract requirements in the meantime, feel free to reply directly to this email.
              </p>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Talent Solutions Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">THRM Universe ATS</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} THRM Universe ATS. All rights reserved.<br>
                Official communication from THRM Universe.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, html, text };
  }
}

export interface ContactInquiryEmailParams {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message?: string;
}

export interface InterviewEmailParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  interviewTitle: string;
  scheduledAt: Date | string;
  durationMinutes?: number;
  meetingLink?: string | null;
  locationNotes?: string | null;
}
