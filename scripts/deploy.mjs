// Compila con la ruta de GitHub Pages y publica dist/ en la rama gh-pages.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const remote = execSync('git remote get-url origin').toString().trim()

run('npm run build', { env: { ...process.env, BASE_PATH: '/cuaderno-acordes/' } })
writeFileSync('dist/.nojekyll', '')
run('git init -q -b gh-pages', { cwd: 'dist' })
run('git add -A', { cwd: 'dist' })
run('git -c user.name=deploy -c user.email=deploy@localhost commit -q -m deploy', { cwd: 'dist' })
run(`git push -f -q ${remote} gh-pages`, { cwd: 'dist' })
console.log('\nPublicado: https://agusfrayre.github.io/cuaderno-acordes/')
