import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const workspaceRoots = ['apps', 'packages', 'adapters', 'plugins']
const sourceExtensions = /\.(?:d\.ts|js|mjs|ts|tsx)$/
const testFilePattern = /\.(?:spec|test)\.(?:js|mjs|ts|tsx)$/
const rootDraftPattern = /^draft_[A-Za-z0-9_-]+_folder$/

const selfTestCount = runSelfTests()
const report = await inspectRepository(root)
if (report.violations.length > 0) {
  for (const violation of report.violations) {
    process.stderr.write(`Architecture violation: ${violation}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(
    `Architecture boundaries passed: ${report.packageCount} packages, `
    + `${report.sourceFileCount} source files, ${report.productionEdgeCount} production edges, `
    + `${selfTestCount} rule self-tests\n`,
  )
}

async function inspectRepository(repositoryRoot) {
  const packages = await discoverPackages(repositoryRoot)
  const packageByName = new Map(packages.map(workspacePackage => [
    workspacePackage.name,
    workspacePackage,
  ]))
  const graph = new Map()
  const violations = []
  let sourceFileCount = 0
  let productionEdgeCount = 0

  for (const workspacePackage of packages) {
    const productionDependencies = internalDependencies(
      workspacePackage.manifest.dependencies,
    )
    graph.set(workspacePackage.name, productionDependencies)
    productionEdgeCount += productionDependencies.length

    for (const dependency of productionDependencies) {
      const target = packageByName.get(dependency)
      if (!target) {
        violations.push(
          `${workspacePackage.name} declares unknown workspace dependency ${dependency}`,
        )
        continue
      }
      const layerError = invalidLayerDependency(workspacePackage.category, target.category)
      if (layerError) {
        violations.push(`${workspacePackage.name} -> ${dependency}: ${layerError}`)
      }
    }

    const sourceRoot = resolve(workspacePackage.directory, 'src')
    const sourceFiles = await filesUnder(sourceRoot)
    sourceFileCount += sourceFiles.length
    for (const sourceFile of sourceFiles) {
      if (testFilePattern.test(sourceFile)) {
        violations.push(`test file must not live under src: ${displayPath(sourceFile)}`)
      }
      const source = await readFile(sourceFile, 'utf8')
      for (const specifier of importSpecifiers(source)) {
        if (forbiddenExternalImport(workspacePackage.category, specifier)) {
          violations.push(
            `${displayPath(sourceFile)} imports adapter SDK ${specifier} from a domain package`,
          )
        }
        if (specifier.startsWith('@lumi/')) {
          const dependency = packageNameFromSpecifier(specifier)
          if (missingProductionDependency(
            workspacePackage.name,
            productionDependencies,
            dependency,
          )) {
            violations.push(
              `${displayPath(sourceFile)} imports ${dependency} without a production dependency`,
            )
          }
        }
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(sourceFile), specifier)
          if (isOutside(workspacePackage.directory, target)) {
            violations.push(
              `${displayPath(sourceFile)} uses a cross-package relative import: ${specifier}`,
            )
          }
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    violations.push(`production dependency cycle: ${cycle.join(' -> ')}`)
  }

  for (const entry of await readdir(repositoryRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && rootDraftPattern.test(entry.name)) {
      violations.push(`generated draft directory must live under data/: ${entry.name}`)
    }
  }

  return {
    packageCount: packages.length,
    productionEdgeCount,
    sourceFileCount,
    violations: [...new Set(violations)].sort(),
  }

  function displayPath(path) {
    return relative(repositoryRoot, path)
  }
}

async function discoverPackages(repositoryRoot) {
  const packages = []
  for (const category of workspaceRoots) {
    const categoryRoot = resolve(repositoryRoot, category)
    for (const entry of await readdir(categoryRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = resolve(categoryRoot, entry.name)
      const manifestPath = resolve(directory, 'package.json')
      try {
        await access(manifestPath)
      } catch {
        continue
      }
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@lumi/')) {
        throw new Error(`Workspace package has an invalid name: ${relative(repositoryRoot, manifestPath)}`)
      }
      packages.push({
        category,
        directory,
        manifest,
        name: manifest.name,
      })
    }
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name))
}

async function filesUnder(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return entry.isFile() && sourceExtensions.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

function internalDependencies(dependencies = {}) {
  return Object.keys(dependencies)
    .filter(name => name.startsWith('@lumi/'))
    .sort()
}

function invalidLayerDependency(sourceCategory, targetCategory) {
  if (sourceCategory === 'packages' && targetCategory !== 'packages') {
    return `packages may depend only on packages, not ${targetCategory}`
  }
  if (sourceCategory === 'adapters' && targetCategory !== 'packages') {
    return `adapters may depend only on packages, not ${targetCategory}`
  }
  if (sourceCategory === 'plugins' && targetCategory !== 'packages') {
    return `plugins may depend only on packages, not ${targetCategory}`
  }
  return undefined
}

function importSpecifiers(source) {
  const specifiers = []
  const pattern = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[1]) specifiers.push(match[1])
  }
  return specifiers
}

function packageNameFromSpecifier(specifier) {
  return specifier.split('/').slice(0, 2).join('/')
}

function missingProductionDependency(packageName, dependencies, importedPackage) {
  return importedPackage !== packageName && !dependencies.includes(importedPackage)
}

function forbiddenExternalImport(category, specifier) {
  return category === 'packages' && specifier.startsWith('@deepseek-ai/')
}

function isOutside(directory, target) {
  const path = relative(directory, target)
  return path === '..' || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function findCycles(graph) {
  const cycles = []
  const state = new Map()
  const stack = []

  for (const node of graph.keys()) visit(node)
  return cycles

  function visit(node) {
    if (state.get(node) === 'done') return
    if (state.get(node) === 'visiting') {
      const start = stack.indexOf(node)
      cycles.push([...stack.slice(start), node])
      return
    }
    state.set(node, 'visiting')
    stack.push(node)
    for (const dependency of graph.get(node) ?? []) {
      if (graph.has(dependency)) visit(dependency)
    }
    stack.pop()
    state.set(node, 'done')
  }
}

function runSelfTests() {
  assert(
    findCycles(new Map([
      ['@lumi/a', ['@lumi/b']],
      ['@lumi/b', ['@lumi/a']],
    ])).length === 1,
    'cycle detection',
  )
  assert(
    invalidLayerDependency('packages', 'adapters') !== undefined,
    'package to adapter rejection',
  )
  assert(
    invalidLayerDependency('adapters', 'packages') === undefined,
    'adapter to package allowance',
  )
  assert(
    invalidLayerDependency('adapters', 'apps') !== undefined,
    'adapter to app rejection',
  )
  assert(
    packageNameFromSpecifier('@lumi/example/internal') === '@lumi/example',
    'package specifier normalization',
  )
  assert(
    missingProductionDependency('@lumi/a', [], '@lumi/b'),
    'undeclared production dependency detection',
  )
  assert(
    forbiddenExternalImport('packages', '@deepseek-ai/example'),
    'domain package adapter SDK rejection',
  )
  assert(
    importSpecifiers("import x from '@lumi/x'; const y = import('./local.ts')")
      .join(',') === '@lumi/x,./local.ts',
    'import parsing',
  )
  assert(
    isOutside('/repo/packages/a', '/repo/packages/b/src/index.ts'),
    'cross-package relative import detection',
  )
  assert(testFilePattern.test('src/example.test.ts'), 'src test detection')
  assert(rootDraftPattern.test('draft_abc_folder'), 'root draft detection')
  return 11
}

function assert(condition, name) {
  if (!condition) throw new Error(`Architecture checker self-test failed: ${name}`)
}
