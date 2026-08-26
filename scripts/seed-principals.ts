import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const supabaseUrl = 'https://pucctownicjpuejjodbm.supabase.co';
const serviceRoleKey = 'sb_secret_Z8P3xOmZ0GQK9IPJg1efDw_v1KmjJwC';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runSeed() {
  const filePath = path.resolve(process.cwd(), 'LIST PRINCIPAL 2025 AB2.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

  const girlsColleges = rawData.filter(row =>
    /GIRL|WOM[AE]N|FEMALE/i.test(String(row['Name of College'] || ''))
  );

  console.log(`Found ${girlsColleges.length} Girls/Women colleges. Starting provisioning...\n`);

  const createdCredentials: Array<{
    College_Code: string;
    College_Name: string;
    Principal_Name: string;
    Login_Email: string;
    Password: string;
    Phone: string;
  }> = [];

  for (const row of girlsColleges) {
    const rawCollege = String(row['Name of College'] || '').trim();
    const match = rawCollege.match(/^(KQ\d+)\s+(.*)$/i);
    const code = match ? match[1].toUpperCase() : null;
    const collegeName = match ? match[2].trim() : rawCollege;
    const principalName = String(row['Name of Principal'] || '').replace(/\n/g, ' ').trim();

    let phone = String(row['Contact Number'] || '').trim();
    if (phone.includes('.')) {
      phone = String(parseInt(phone, 10));
      if (phone.length === 10 && phone.startsWith('3')) {
        phone = '0' + phone;
      }
    }

    if (!code) continue;

    const { data: instData, error: instErr } = await supabaseAdmin
      .from('institutions')
      .upsert(
        { code, name: collegeName, is_active: true },
        { onConflict: 'code' }
      )
      .select('id')
      .single();

    if (instErr) {
      console.error(`[Institution Error] ${code}:`, instErr.message);
      continue;
    }

    const email = `${code.toLowerCase()}@assembly.portal`;
    const password = `College@${code}!`;

    let userId: string | null = null;

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: principalName, phone, code }
    });

    if (authErr) {
      if (authErr.message.toLowerCase().includes('already registered')) {
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const existing = userList?.users.find(u => u.email === email);
        if (existing) userId = existing.id;
      } else {
        console.error(`[Auth Error] ${email}:`, authErr.message);
        continue;
      }
    } else {
      userId = authUser.user.id;
    }

    if (userId) {
      const { error: profErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          full_name: principalName,
          role: 'principal',
          institution_id: instData.id
        });

      if (profErr) {
        console.error(`[Profile Error] ${code}:`, profErr.message);
      } else {
        console.log(`Provisioned: ${code} - ${principalName}`);
        createdCredentials.push({
          College_Code: code,
          College_Name: collegeName,
          Principal_Name: principalName,
          Login_Email: email,
          Password: password,
          Phone: phone
        });
      }
    }
  }

  const outWorksheet = XLSX.utils.json_to_sheet(createdCredentials);
  const outWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWorkbook, outWorksheet, 'Accounts');
  XLSX.writeFile(outWorkbook, 'girls_colleges_credentials.xlsx');

  console.log(`\n======================================================`);
  console.log(`Finished! Created ${createdCredentials.length} accounts.`);
  console.log(`Credentials saved to: girls_colleges_credentials.xlsx`);
  console.log(`======================================================`);
}

runSeed().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
