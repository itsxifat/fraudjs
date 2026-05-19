#!/usr/bin/env node
import { program } from 'commander';
import { createInterface } from 'node:readline';
import { checkPhone, addCredential, listCredentials, removeCredential, refresh } from '../src/index.js';

// ---------- Prompts ----------

async function promptLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptPassword(question) {
  // TTY mode: hide keystrokes
  if (process.stdin.isTTY) {
    return new Promise(resolve => {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      let input = '';
      function onData(ch) {
        if (ch === '\r' || ch === '\n' || ch === '') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
        } else if (ch === '') {
          process.stdout.write('\n');
          process.exit(1);
        } else if (ch === '') {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      }
      process.stdin.on('data', onData);
    });
  }

  // Non-TTY (piped input): read normally
  return promptLine(question);
}

// ---------- Commands ----------

program
  .name('fraudjs')
  .description('Check Steadfast Courier delivery/fraud history by phone number')
  .version('1.0.0');

program
  .command('check <phone>')
  .description('Look up delivery and fraud stats for a phone number')
  .action(async (phone) => {
    try {
      const result = await checkPhone(phone);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.failures?.length) {
        for (const { email, error } of err.failures) {
          console.error(`  [${email}] ${error}`);
        }
      }
      process.exit(1);
    }
  });

program
  .command('add-credential')
  .description('Add a Steadfast merchant credential (stored encrypted in OS config dir)')
  .action(async () => {
    try {
      const email = await promptLine('Email: ');
      const password = await promptPassword('Password: ');
      if (!email || !password) {
        console.error('Email and password are required.');
        process.exit(1);
      }
      await addCredential({ email, password });
      console.log(`Credential saved for ${email}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('list-credentials')
  .description('List stored credential emails (passwords are never shown)')
  .action(async () => {
    try {
      const emails = await listCredentials();
      if (emails.length === 0) {
        console.log('No stored credentials. Use `fraudjs add-credential` or set FRAUDJS_CREDENTIALS in .env');
        return;
      }
      emails.forEach(e => console.log(`  ${e}`));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('remove-credential <email>')
  .description('Remove a stored credential by email')
  .action(async (email) => {
    try {
      await removeCredential(email);
      console.log(`Removed credential for ${email}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('refresh')
  .description('Force-refresh session cookies for all configured credentials')
  .action(async () => {
    try {
      await refresh();
      console.log('Session cookies refreshed.');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
