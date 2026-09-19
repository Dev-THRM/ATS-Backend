import { Injectable } from '@nestjs/common';

export interface EmailTemplateParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName?: string;
  rejectionReason?: string | null;
  customNotes?: string | null;
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
   * Template: Candidate clears HR round -> Offer Template (Congratulations!)
   */
  renderOfferEmail(params: EmailTemplateParams): RenderedEmail {
    const { candidateName, jobTitle, companyName, customNotes } = params;
    const subject = `🎉 Congratulations! Job Offer for ${jobTitle} at ${companyName}`;

    const text = `Dear ${candidateName},

CONGRATULATIONS! 🎉

We are thrilled to inform you that you have successfully cleared the HR and interview rounds for the ${jobTitle} position at ${companyName}!

The leadership and interview team were very impressed with your credentials, skills, and conversations throughout the hiring process.

We are delighted to extend this formal offer of employment to you. Our Human Resources team is currently finalizing your official offer letter and compensation package. We will share the paperwork and next onboarding steps with you shortly.

${customNotes ? `Note from HR: ${customNotes}\n\n` : ''}
Once again, congratulations! We are excited about the prospect of having you on our team.

Warm regards,
Human Resources Team
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
          <!-- Celebratory Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669, #10b981); padding: 36px 28px; text-align: center;">
              <div style="display: inline-block; font-size: 36px; margin-bottom: 8px;">🎉</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">
                Congratulations, ${candidateName}!
              </h1>
              <p style="margin: 8px 0 0 0; color: #d1fae5; font-size: 15px; font-weight: 600;">
                You Cleared the HR Round &bull; Job Offer Extended
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #0f172a;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We are thrilled to let you know that you have <strong>successfully cleared the HR evaluation and interview rounds</strong> for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>!
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Our leadership and interviewing team were thoroughly impressed with your technical capabilities, background, and cultural alignment with our agency mission.
              </p>

              <!-- Offer Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 14px; margin: 24px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-size: 12px; font-weight: 800; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Offer of Employment</div>
                    <div style="font-size: 18px; font-weight: 900; color: #065f46; margin-bottom: 4px;">${jobTitle}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #16a34a;">Organization: ${companyName}</div>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #bbf7d0; font-size: 13px; color: #15803d; line-height: 1.5;">
                      ✅ <strong>Next Step:</strong> Our HR operations team is preparing your official offer letter and compensation schedule. You will receive the documents shortly for review and electronic signature.
                    </div>
                  </td>
                </tr>
              </table>

              ${
                customNotes
                  ? `
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0;">
                <tr>
                  <td style="padding: 16px;">
                    <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;">HR Notes</div>
                    <div style="font-size: 14px; color: #334155; margin-top: 4px; line-height: 1.5;">${customNotes}</div>
                  </td>
                </tr>
              </table>
              `
                  : ''
              }

              <p style="margin: 20px 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We are immensely excited about the potential of welcoming you aboard and working together to achieve great milestones!
              </p>

              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">Human Resources Team</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${companyName}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.<br>
                Official communication from Human Resources.
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
}
