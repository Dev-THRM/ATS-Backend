import { PrismaClient, JobStatus, EmploymentType, ExperienceLevel, ApplicationStatus } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Dream11 Realistic ATS Seeding with Full Resume Generation ---');

  // Ensure storage directory exists
  const storageDir = path.resolve(process.cwd(), 'storage', 'resumes');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  // 1. Locate Dream11 organization
  let org = await prisma.organization.findUnique({
    where: { slug: 'dream11' },
    include: { users: true },
  });

  if (!org) {
    org = await prisma.organization.findFirst({
      where: { name: { contains: 'Dream11', mode: 'insensitive' } },
      include: { users: true },
    });
  }

  if (!org) {
    console.error('Organization Dream11 not found! Please register or check the slug.');
    process.exit(1);
  }

  console.log(`Found organization: ${org.name} (ID: ${org.id}, Slug: ${org.slug})`);

  const creatorUser = org.users[0];
  if (!creatorUser) {
    console.error('No users found in organization Dream11');
    process.exit(1);
  }

  // 2. Define rich job openings
  const jobTemplates = [
    {
      title: 'Lead Distributed Systems Engineer (Backend)',
      department: 'Engineering - Core Platform',
      location: 'Mumbai, India (Hybrid)',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      salaryMin: 3500000,
      salaryMax: 5500000,
      experienceMin: 5,
      experienceMax: 10,
      experienceLevel: ExperienceLevel.LEAD,
      description: `
### Role Overview
Join Dream11's core platform team responsible for handling millions of concurrent users during live IPL and World Cup match events. You will architect and scale high-throughput event processing pipelines with ultra-low latency.

### Key Responsibilities
- Architect high-scale distributed microservices in Go and Java processing over 10M requests/sec.
- Optimize database performance across PostgreSQL, ScyllaDB, and Redis clusters.
- Collaborate with SRE and data teams on zero-downtime distributed deployments.

### Requirements
- 5+ years of production experience building high-throughput distributed systems.
- Deep expertise in Go, Java, Kafka, gRPC, and distributed caching.
- Strong fundamentals in concurrency, distributed transactions, and data consistency models.
      `.trim(),
    },
    {
      title: 'Staff Frontend Engineer (Web & Mobile Web)',
      department: 'Engineering - User Experience',
      location: 'Mumbai / Remote',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      salaryMin: 3000000,
      salaryMax: 4800000,
      experienceMin: 4,
      experienceMax: 9,
      experienceLevel: ExperienceLevel.SENIOR,
      description: `
### Role Overview
Lead the frontend architecture for Dream11's web platform, delivering high-performance, real-time match engagement and fantasy sports experiences.

### Key Responsibilities
- Build responsive, ultra-fast web interfaces using React 19, TypeScript, and Next.js.
- Implement WebSocket real-time live score and leaderboard updates.
- Drive web performance optimization targeting sub-second First Contentful Paint.

### Requirements
- 4+ years of modern React & TypeScript ecosystem experience.
- Deep understanding of state management, WebSockets, web workers, and canvas/SVG animations.
      `.trim(),
    },
    {
      title: 'Product Manager - Core Gaming & Match Engagement',
      department: 'Product',
      location: 'Mumbai, India (Onsite)',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      salaryMin: 2800000,
      salaryMax: 4500000,
      experienceMin: 3,
      experienceMax: 7,
      experienceLevel: ExperienceLevel.MID,
      description: `
### Role Overview
Own product roadmap for in-match engagement, real-time leaderboards, and gamification loops for over 150M sports fans.

### Key Responsibilities
- Define product specifications, PRDs, and user journeys for match day contest flows.
- Run multivariate A/B tests to optimize conversion, retention, and session duration.
- Work closely with engineering, data science, and sports domain experts.
      `.trim(),
    },
    {
      title: 'DevOps & Site Reliability Engineer (Kubernetes / AWS)',
      department: 'Infrastructure & SRE',
      location: 'Mumbai, India (Hybrid)',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      salaryMin: 2500000,
      salaryMax: 4000000,
      experienceMin: 3,
      experienceMax: 8,
      experienceLevel: ExperienceLevel.MID,
      description: `
### Role Overview
Manage and automate cloud infrastructure spanning thousands of EC2/EKS nodes capable of surging 50x during peak cricket tournaments.

### Key Responsibilities
- Manage multi-region Kubernetes clusters with automated autoscaling.
- Build CI/CD pipelines and infrastructure-as-code using Terraform.
- Implement comprehensive telemetry, tracing, and automated chaos engineering drills.
      `.trim(),
    },
    {
      title: 'Senior AI/ML Engineer (Recommendation & Personalization)',
      department: 'Data & AI',
      location: 'Mumbai / Bengaluru (Hybrid)',
      employmentType: EmploymentType.FULL_TIME,
      status: JobStatus.OPEN,
      salaryMin: 3200000,
      salaryMax: 5000000,
      experienceMin: 4,
      experienceMax: 8,
      experienceLevel: ExperienceLevel.SENIOR,
      description: `
### Role Overview
Build real-time recommendation engines for personalized match contests, team suggestions, and sports content feed.

### Key Responsibilities
- Develop real-time ML inference pipelines using PyTorch, Ray, and Feast Feature Store.
- Optimize personalized ranking algorithms for millions of active user sessions.
      `.trim(),
    },
  ];

  const standardStages = [
    { name: 'Applied', order: 0 },
    { name: 'Screening', order: 1 },
    { name: 'Tech Interview', order: 2 },
    { name: 'Cultural & Managerial', order: 3 },
    { name: 'Offer Extended', order: 4 },
    { name: 'Hired', order: 5 },
    { name: 'Rejected', order: 6 },
  ];

  const createdJobs: any[] = [];

  for (const template of jobTemplates) {
    let existingJob = await prisma.job.findFirst({
      where: {
        organizationId: org.id,
        title: template.title,
      },
      include: { pipelineStages: true },
    });

    if (!existingJob) {
      existingJob = await prisma.job.create({
        data: {
          organizationId: org.id,
          createdById: creatorUser.id,
          title: template.title,
          department: template.department,
          location: template.location,
          employmentType: template.employmentType,
          status: template.status,
          salaryMin: template.salaryMin,
          salaryMax: template.salaryMax,
          salaryCurrency: 'INR',
          salaryVisible: true,
          experienceMin: template.experienceMin,
          experienceMax: template.experienceMax,
          experienceLevel: template.experienceLevel,
          description: template.description,
          pipelineStages: {
            create: standardStages.map((s) => ({
              name: s.name,
              order: s.order,
            })),
          },
        },
        include: { pipelineStages: true },
      });
      console.log(`Created Job: ${existingJob.title}`);
    }
    createdJobs.push(existingJob);
  }

  // Helper to generate formatted HTML resume document
  const generateResumeHtml = (c: any) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${c.firstName} ${c.lastName} - Resume</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { margin: 0; color: #0f172a; font-size: 26px; font-weight: 800; }
    .subtitle { color: #2563eb; font-size: 15px; font-weight: 600; margin-top: 4px; }
    .contact-bar { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #64748b; margin-top: 12px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 24px; margin-bottom: 12px; }
    .exp-item { margin-bottom: 16px; }
    .exp-header { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; color: #0f172a; }
    .exp-sub { font-size: 13px; color: #2563eb; font-weight: 600; }
    .skills-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .skill-pill { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    p, li { font-size: 13px; color: #334155; }
    ul { margin: 6px 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>${c.firstName} ${c.lastName}</h1>
  <div class="subtitle">${c.currentTitle} • ${c.currentCompany}</div>
  <div class="contact-bar">
    <span>📧 ${c.email}</span>
    <span>📱 ${c.phone}</span>
    <span>📍 ${c.location}</span>
    <span>🔗 ${c.linkedinUrl}</span>
  </div>

  <div class="section-title">Professional Summary</div>
  <p>${c.summary}</p>

  <div class="section-title">Core Technical Competencies</div>
  <div class="skills-grid">
    ${c.skills.map((s: string) => `<span class="skill-pill">${s}</span>`).join('')}
  </div>

  <div class="section-title">Work Experience</div>
  <div class="exp-item">
    <div class="exp-header">
      <span>${c.currentTitle}</span>
      <span style="color: #64748b; font-weight: 500;">2022 - Present</span>
    </div>
    <div class="exp-sub">${c.currentCompany} • ${c.location}</div>
    <ul>
      ${c.experiencePoints.map((p: string) => `<li>${p}</li>`).join('')}
    </ul>
  </div>

  <div class="section-title">Education & Credentials</div>
  <div class="exp-item">
    <div class="exp-header">
      <span>Bachelor of Technology in Computer Science & Engineering</span>
      <span style="color: #64748b; font-weight: 500;">First Class with Distinction</span>
    </div>
    <div class="exp-sub">Premier Institute of Technology</div>
  </div>
</body>
</html>
  `.trim();

  // 3. Rich Candidate Pool
  const candidatesData = [
    {
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul.verma.tech@gmail.com',
      phone: '+91 98765 43210',
      currentCompany: 'Razorpay',
      currentTitle: 'Senior Distributed Systems Engineer',
      location: 'Bengaluru, India',
      skills: ['Go', 'Kafka', 'PostgreSQL', 'Distributed Systems', 'Redis', 'gRPC', 'Docker'],
      source: 'LINKEDIN',
      linkedinUrl: 'https://linkedin.com/in/rahulverma-dev',
      jobIndex: 0,
      stageOrder: 2,
      atsScore: 94.5,
      utmSource: 'linkedin',
      summary: 'Senior Backend Engineer with 6+ years specializing in distributed payment systems, high-concurrency event brokers, and sub-millisecond API architectures.',
      experiencePoints: [
        'Architected Razorpay core payout event-driven processing pipeline handling 40M daily transactions with 99.999% SLA.',
        'Engineered Redis distributed locks and multi-region read replicas, slashing peak p99 latency from 140ms to 18ms.',
        'Mentored 6 software engineers and led cross-functional migration to Go microservices.',
      ],
    },
    {
      firstName: 'Ananya',
      lastName: 'Sharma',
      email: 'ananya.sharma.ux@gmail.com',
      phone: '+91 98112 33445',
      currentCompany: 'Swiggy',
      currentTitle: 'Lead Frontend Developer',
      location: 'Bengaluru / Mumbai',
      skills: ['React', 'TypeScript', 'Next.js', 'WebSockets', 'Tailwind CSS', 'Redux', 'Jest'],
      source: 'NAUKRI',
      linkedinUrl: 'https://linkedin.com/in/ananyasharma-fe',
      jobIndex: 1,
      stageOrder: 4,
      atsScore: 91.0,
      utmSource: 'naukri',
      summary: 'Frontend Architect with 7 years of building ultra-responsive real-time user experiences, design systems, and micro-frontend architectures for hyper-growth consumer apps.',
      experiencePoints: [
        'Led frontend development for Swiggy live delivery tracking interface used by 20M+ monthly active users.',
        'Implemented WebSocket state sync and canvas animations reducing mobile battery footprint by 22%.',
        'Standardized component library in TypeScript and Tailwind, speeding up team sprint velocity by 35%.',
      ],
    },
    {
      firstName: 'Vikramaditya',
      lastName: 'Patil',
      email: 'vikram.patil.ops@gmail.com',
      phone: '+91 99223 88776',
      currentCompany: 'CRED',
      currentTitle: 'Lead DevOps & Cloud Engineer',
      location: 'Mumbai, India',
      skills: ['Kubernetes', 'AWS', 'Terraform', 'CI/CD', 'Prometheus', 'Helm', 'ArgoCD'],
      source: 'REFERRAL',
      linkedinUrl: 'https://linkedin.com/in/vikrampatil-sre',
      jobIndex: 3,
      stageOrder: 3,
      atsScore: 88.5,
      utmSource: 'employee_referral',
      summary: 'Infrastructure and SRE Leader with 8 years scaling AWS and multi-tenant Kubernetes clusters with zero downtime and automated GitOps workflows.',
      experiencePoints: [
        'Designed CRED EKS autoscaling cluster managing dynamic scale from 200 to 3,000 pods during flash events.',
        'Automated multi-region infrastructure provisioning using Terraform and ArgoCD GitOps pipelines.',
        'Reduced annual cloud spend by 28% through aggressive spot instance orchestration and Karpenter.',
      ],
    },
    {
      firstName: 'Sneha',
      lastName: 'Kulkarni',
      email: 'sneha.kulkarni.pm@gmail.com',
      phone: '+91 97654 11223',
      currentCompany: 'Zomato',
      currentTitle: 'Product Manager - Growth',
      location: 'Gurugram / Mumbai',
      skills: ['Product Strategy', 'A/B Testing', 'SQL', 'User Research', 'Gamification', 'Mixpanel'],
      source: 'GLASSDOOR',
      linkedinUrl: 'https://linkedin.com/in/snehakulkarni-pm',
      jobIndex: 2,
      stageOrder: 2,
      atsScore: 86.0,
      utmSource: 'glassdoor',
      summary: 'Product Manager with 5 years driving gamified user journeys, conversion rate optimization, and consumer retention in high-velocity tech companies.',
      experiencePoints: [
        'Launched Zomato Gold gamification badges and streak loops, boosting 30-day user retention by 18%.',
        'Executed 50+ multivariate A/B experiments on checkout funnel increasing organic conversion by 4.2%.',
      ],
    },
    {
      firstName: 'Aditya',
      lastName: 'Nair',
      email: 'aditya.nair.ai@gmail.com',
      phone: '+91 98450 67890',
      currentCompany: 'PhonePe',
      currentTitle: 'Senior Machine Learning Engineer',
      location: 'Bengaluru, India',
      skills: ['Python', 'PyTorch', 'RecSys', 'Transformers', 'Spark', 'Feature Store', 'MLOps'],
      source: 'UNSTOP',
      linkedinUrl: 'https://linkedin.com/in/adityanair-ml',
      jobIndex: 4,
      stageOrder: 5,
      atsScore: 96.5,
      utmSource: 'unstop',
      summary: 'AI/ML Researcher & Engineer specializing in high-throughput recommendation systems, personalized ranking, and real-time graph neural networks.',
      experiencePoints: [
        'Engineered PhonePe merchant recommendation feed with two-tower deep retrieval and real-time re-ranking.',
        'Decreased feature store retrieval latency from 45ms to 6ms using Feast and Triton Inference Server.',
      ],
    },
    {
      firstName: 'Amitav',
      lastName: 'Banerjee',
      email: 'amitav.banerjee.sde@gmail.com',
      phone: '+91 98310 44556',
      currentCompany: 'Amazon India',
      currentTitle: 'Senior Software Engineer (Tier-1 Systems)',
      location: 'Hyderabad, India',
      skills: ['Distributed Systems', 'Java', 'DynamoDB', 'AWS', 'System Architecture', 'High Scale'],
      source: 'REFERRAL',
      linkedinUrl: 'https://linkedin.com/in/amitavbanerjee',
      jobIndex: 0,
      stageOrder: 4,
      atsScore: 97.5,
      utmSource: 'employee_referral',
      summary: 'Tier-1 backend specialist with 8 years of building fault-tolerant cloud services handling billions of daily catalog requests.',
      experiencePoints: [
        'Spearheaded global catalog replication engine supporting 15,000 TPS with active-active resilience.',
        'Designed asynchronous reconciliation worker pool saving $400k in monthly compute overhead.',
      ],
    },
    {
      firstName: 'Priya',
      lastName: 'Sundaram',
      email: 'priya.sundaram.code@gmail.com',
      phone: '+91 94441 55667',
      currentCompany: 'Flipkart',
      currentTitle: 'Backend SDE-3',
      location: 'Bengaluru, India',
      skills: ['Java', 'Spring Boot', 'Kafka', 'Distributed Caching', 'PostgreSQL', 'Cassandra'],
      source: 'LINKEDIN',
      linkedinUrl: 'https://linkedin.com/in/priyasundaram',
      jobIndex: 0,
      stageOrder: 1,
      atsScore: 89.0,
      utmSource: 'linkedin',
      summary: 'High-scale Java/Spring engineer with deep expertise in Big Billion Days flash sales scaling and messaging queues.',
      experiencePoints: [
        'Optimized cart checkout transaction manager processing 200k orders per minute during festive sales.',
      ],
    },
    {
      firstName: 'Rohan',
      lastName: 'Gupta',
      email: 'rohan.gupta.dev@gmail.com',
      phone: '+91 98200 11998',
      currentCompany: 'Groww',
      currentTitle: 'SDE-2 Distributed Backend',
      location: 'Mumbai, India',
      skills: ['Go', 'PostgreSQL', 'Redis', 'Microservices', 'Kubernetes'],
      source: 'CAREER_PORTAL',
      linkedinUrl: 'https://linkedin.com/in/rohangupta-code',
      jobIndex: 0,
      stageOrder: 0,
      atsScore: 82.5,
      utmSource: 'career_portal',
      summary: 'Backend Go developer passionate about microservice concurrency, database indexing, and automated testing.',
      experiencePoints: [
        'Built stock order execution pipeline in Go with zero-loss audit logging.',
      ],
    },
  ];

  for (const c of candidatesData) {
    // Generate file on disk
    const fileName = `${c.firstName.toLowerCase()}_${c.lastName.toLowerCase()}_resume.html`;
    const filePath = path.join(storageDir, fileName);
    fs.writeFileSync(filePath, generateResumeHtml(c), 'utf8');

    const publicResumeUrl = `/storage/resumes/${fileName}`;

    // Upsert Candidate
    let candidate = await prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email: c.email,
          organizationId: org.id,
        },
      },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          organizationId: org.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          currentCompany: c.currentCompany,
          currentTitle: c.currentTitle,
          location: c.location,
          skills: c.skills,
          source: c.source,
          resumeUrl: publicResumeUrl,
          linkedinUrl: c.linkedinUrl,
          tags: ['IPL 2026 Batch', c.source, c.currentCompany],
        },
      });
    } else {
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          resumeUrl: publicResumeUrl,
          skills: c.skills,
          currentCompany: c.currentCompany,
          currentTitle: c.currentTitle,
          location: c.location,
        },
      });
    }

    const targetJob = createdJobs[c.jobIndex] || createdJobs[0];
    const stages = targetJob.pipelineStages.sort((a: any, b: any) => a.order - b.order);
    const targetStage = stages[c.stageOrder] || stages[0];

    let appStatus: ApplicationStatus = ApplicationStatus.ACTIVE;
    if (targetStage.name === 'Hired') appStatus = ApplicationStatus.HIRED;
    if (targetStage.name === 'Rejected') appStatus = ApplicationStatus.REJECTED;

    const existingApp = await prisma.application.findFirst({
      where: {
        candidateId: candidate.id,
        jobId: targetJob.id,
      },
    });

    const resumeMetadata = {
      resumeUrl: publicResumeUrl,
      resumeKey: `resumes/${fileName}`,
      summary: c.summary,
      experiencePoints: c.experiencePoints,
      atsScore: c.atsScore,
    };

    if (!existingApp) {
      await prisma.application.create({
        data: {
          organizationId: org.id,
          candidateId: candidate.id,
          jobId: targetJob.id,
          currentStageId: targetStage.id,
          status: appStatus,
          atsScore: c.atsScore,
          source: c.source,
          utmSource: c.utmSource,
          utmMedium: 'ats_pipeline',
          utmCampaign: 'dream11_hiring_sprint',
          coverLetter: c.summary,
          metadata: resumeMetadata,
        },
      });
    } else {
      await prisma.application.update({
        where: { id: existingApp.id },
        data: {
          atsScore: c.atsScore,
          metadata: resumeMetadata,
        },
      });
    }
  }

  console.log(`\n Seeding & Resume Generation Complete!`);
  console.log(`- Resumes generated on disk in /storage/resumes/ for all candidates.`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
