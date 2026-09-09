import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const interviews = await prisma.interview.findMany();
  console.log(`Found ${interviews.length} interviews`);

  for (const interview of interviews) {
    if (interview.meetingLink && interview.meetingLink.includes('-xxx')) {
      const updatedLink = 'https://meet.google.com/new';
      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          meetingLink: updatedLink,
        },
      });
      console.log(`Updated interview ${interview.id} meetingLink to ${updatedLink}`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
