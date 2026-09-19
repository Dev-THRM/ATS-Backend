const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const candidate = await prisma.candidate.findUnique({
    where: { id: 'b108e487-6ff3-42bb-841e-554ef5b345dc' },
    include: { applications: true }
  });
  console.log('Candidate Resume URL:', candidate.resumeUrl);
  for (const app of candidate.applications) {
    console.log('App Metadata:', app.metadata);
  }
}

main().finally(() => prisma.$disconnect());
