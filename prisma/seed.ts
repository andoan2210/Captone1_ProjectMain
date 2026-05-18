import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@admin.com';
  
  // Kiểm tra xem admin đã tồn tại chưa
  const existingAdmin = await prisma.users.findUnique({
    where: { Email: adminEmail },
  });

  if (!existingAdmin) {
    const saltRounds = 10;
    // Đổi mật khẩu ở đây nếu muốn
    const hashedPassword = await bcrypt.hash('admin123', saltRounds);

    const adminUser = await prisma.users.create({
      data: {
        FullName: 'System Admin',
        Email: adminEmail,
        PasswordHash: hashedPassword,
        Role: 'ADMIN', // Hoặc SUPERADMIN tùy logic dự án của bạn
        AuthProvider: 'local',
      },
    });

    console.log('✅ Admin account created:');
    console.log(`Email: ${adminUser.Email}`);
    console.log(`Password: admin123`);
  } else {
    console.log('⚠️ Admin account already exists:', adminEmail);
  }
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi chạy seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
