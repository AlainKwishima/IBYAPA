const { execSync } = require('child_process');

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  console.log(out);
  return out;
}

try {
  run('git add .');
  run('git commit -m "Update build to 17 and require explicit payment confirmation"');
  run('git push origin main');
  console.log('Successfully committed and pushed to GitHub');
} catch (e) {
  console.error('Error running git commands:', e.message);
  if (e.stdout) console.log('stdout:', e.stdout);
  if (e.stderr) console.error('stderr:', e.stderr);
  process.exit(1);
}
