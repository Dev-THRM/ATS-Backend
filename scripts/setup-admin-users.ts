import { PrismaClient, SystemRoleType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Finding THRM Digital Marketing Agency organization...');
  const org = await prisma.organization.findFirst({
    where: { slug: 'thrm-digital-marketing-agency' },
    include: { roles: true },
  });

  if (!org) {
    throw new Error('Organization thrm-digital-marketing-agency not found!');
  }

  console.log('Organization found:', org.name, org.id);

  // 1. Find Super Admin and Admin roles
  const superAdminRole = org.roles.find((r) => r.type === SystemRoleType.SUPER_ADMIN);
  let adminRole = org.roles.find((r) => r.type === SystemRoleType.ADMIN);

  if (!superAdminRole) {
    throw new Error('Super Admin role not found for organization!');
  }

  if (!adminRole) {
    console.log('Creating Admin role...');
    adminRole = await prisma.role.create({
      data: {
        organizationId: org.id,
        name: 'Admin',
        description: 'Organizational administrator with full access',
        type: SystemRoleType.ADMIN,
        isSystem: true,
        permissions: ['*'],
      },
    });
  } else {
    // Ensure Admin has full permissions ['*'] identical to Super Admin
    console.log('Updating Admin role permissions to wildcard ["*"]...');
    adminRole = await prisma.role.update({
      where: { id: adminRole.id },
      data: {
        permissions: ['*'],
        description: 'Organizational administrator with full access',
      },
    });
  }

  console.log('Super Admin Role ID:', superAdminRole.id);
  console.log('Admin Role ID:', adminRole.id, 'Permissions:', adminRole.permissions);

  const defaultTempPasswordHash = await bcrypt.hash('Admin@123', 12);

  // 2. Ensure dev@thrmdigitalmarketing.in is Super Admin
  const devUser = await prisma.user.findFirst({
    where: {
      email: 'dev@thrmdigitalmarketing.in',
      organizationId: org.id,
    },
  });

  if (devUser) {
    await prisma.user.update({
      where: { id: devUser.id },
      data: {
        roleId: superAdminRole.id,
        isActive: true,
      },
    });
    console.log('Updated dev@thrmdigitalmarketing.in -> Super Admin');
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: superAdminRole.id,
        email: 'dev@thrmdigitalmarketing.in',
        firstName: 'THRM',
        lastName: 'Dev',
        passwordHash: defaultTempPasswordHash,
        isActive: true,
      },
    });
    console.log('Created dev@thrmdigitalmarketing.in -> Super Admin');
  }

  // 3. Admin: snehadewani07@gmail.com
  const snehaUser = await prisma.user.findFirst({
    where: {
      email: 'snehadewani07@gmail.com',
      organizationId: org.id,
    },
  });

  if (snehaUser) {
    await prisma.user.update({
      where: { id: snehaUser.id },
      data: {
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('Updated snehadewani07@gmail.com -> Admin');
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: adminRole.id,
        email: 'snehadewani07@gmail.com',
        firstName: 'Sneha',
        lastName: 'Dewani',
        passwordHash: defaultTempPasswordHash,
        isActive: true,
      },
    });
    console.log('Created snehadewani07@gmail.com -> Admin');
  }

  // 4. Admin: bijlanisahil511@gmail.com
  const sahilUser = await prisma.user.findFirst({
    where: {
      email: 'bijlanisahil511@gmail.com',
      organizationId: org.id,
    },
  });

  if (sahilUser) {
    await prisma.user.update({
      where: { id: sahilUser.id },
      data: {
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('Updated bijlanisahil511@gmail.com -> Admin');
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: adminRole.id,
        email: 'bijlanisahil511@gmail.com',
        firstName: 'Sahil',
        lastName: 'Bijlani',
        passwordHash: defaultTempPasswordHash,
        isActive: true,
      },
    });
    console.log('Created bijlanisahil511@gmail.com -> Admin');
  }

  // 5. Admin: sunnysharma05@gmail.com
  const sunnyUser = await prisma.user.findFirst({
    where: {
      email: 'sunnysharma05@gmail.com',
      organizationId: org.id,
    },
  });

  if (sunnyUser) {
    await prisma.user.update({
      where: { id: sunnyUser.id },
      data: {
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('Updated sunnysharma05@gmail.com -> Admin');
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: adminRole.id,
        email: 'sunnysharma05@gmail.com',
        firstName: 'Sunny',
        lastName: 'Sharma',
        passwordHash: defaultTempPasswordHash,
        isActive: true,
      },
    });
    console.log('Created sunnysharma05@gmail.com -> Admin (Password: Admin@123)');
  }

  // 6. Admin: gunjan@thrmdigitalmarketing.in
  const gunjanUser = await prisma.user.findFirst({
    where: {
      email: 'gunjan@thrmdigitalmarketing.in',
      organizationId: org.id,
    },
  });

  if (gunjanUser) {
    await prisma.user.update({
      where: { id: gunjanUser.id },
      data: {
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('Updated gunjan@thrmdigitalmarketing.in -> Admin');
  } else {
    await prisma.user.create({
      data: {
        organizationId: org.id,
        roleId: adminRole.id,
        email: 'gunjan@thrmdigitalmarketing.in',
        firstName: 'Gunjan',
        lastName: '',
        passwordHash: defaultTempPasswordHash,
        isActive: true,
      },
    });
    console.log('Created gunjan@thrmdigitalmarketing.in -> Admin (Password: Admin@123)');
  }

  // Fetch final user list for organization
  console.log('\n--- Final Team Members in THRM Digital Marketing Agency ---');
  const finalUsers = await prisma.user.findMany({
    where: { organizationId: org.id },
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });

  console.table(
    finalUsers.map((u) => ({
      Name: `${u.firstName} ${u.lastName}`.trim(),
      Email: u.email,
      RoleName: u.role?.name,
      RoleType: u.role?.type,
      Active: u.isActive,
      Permissions: u.role?.permissions,
    }))
  );
}

main()
  .catch((e) => {
    console.error('Error setting up admin users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
